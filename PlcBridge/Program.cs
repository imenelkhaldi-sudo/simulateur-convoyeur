using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.Loader;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

// ====================================================================
// SITRAIN Simulator Web — PlcBridge, build « SimulateurV15 »
//
// Serveur HTTP (fichiers web, port 8080) + WebSocket (E/S, port 8765)
// avec deux dorsaux automate, choisis a l'execution :
//   - PLCSim Advanced via l'API Siemens (DLL chargee dynamiquement,
//     n'importe quelle version installee : V2.0 a V8.0) ;
//   - protocole S7 sur Ethernet via S7.Net : automate reel S7-1500 /
//     ET200SP, ou S7-PLCSIM classique derriere NetToPLCSim.
// Le dorsal S7 est active par l'argument --plc-ip ou par le message
// WebSocket « connect_plc » {ip, rack, slot} envoye par la page.
// ====================================================================

/// <summary>Adresse absolue decodee : I0.3, QW32, M10.0, MW20...</summary>
record struct PlcAddr(string Addr, char Area, int ByteOff, int BitOff, bool IsWord);

interface IPlcBackend : IDisposable
{
    string Name { get; }
    bool Connected { get; }
    /// <summary>Lecture groupee. Une adresse absente du resultat = lecture impossible.</summary>
    Dictionary<string, object> ReadMany(IReadOnlyList<PlcAddr> vars);
    void Write(PlcAddr a, object value);
    /// <summary>Periode (en cycles de 50 ms) de reecriture du cache des entrees.</summary>
    int RewritePeriod { get; }
}

enum AdvOutcome { Connected, NoInstance, Refused, ApiMissing }

// ====================================================================
// DORSAL 1 : PLCSim Advanced (API Siemens)
// Aucun type Siemens dans les champs ni les signatures publiques : la
// DLL n'est chargee qu'a l'appel de Create(), ce qui permet de
// fonctionner sans elle (mode S7 seul).
// ====================================================================
sealed class PlcSimAdvBackend : IPlcBackend
{
    readonly object inst;
    public string Name { get; }
    public bool Connected => true;
    public int RewritePeriod => 1;

    PlcSimAdvBackend(object inst, string name) { this.inst = inst; Name = name; }

    public static AdvOutcome TryCreate(out IPlcBackend? backend, out string message)
    {
        backend = null;
        try { return Create(out backend, out message); }
        catch (Exception ex) when (ex is FileNotFoundException || ex is FileLoadException
                                   || ex is BadImageFormatException || ex is TypeLoadException)
        {
            message = ex.Message;
            return AdvOutcome.ApiMissing;
        }
    }

    static AdvOutcome Create(out IPlcBackend? backend, out string message)
    {
        backend = null;
        try
        {
            var instances = Siemens.Simatic.Simulation.Runtime.SimulationRuntimeManager.RegisteredInstanceInfo;
            if (instances.Length == 0) { message = "aucune instance"; return AdvOutcome.NoInstance; }
            var i = Siemens.Simatic.Simulation.Runtime.SimulationRuntimeManager.CreateInterface(instances[0].Name);
            backend = new PlcSimAdvBackend(i, $"PLCSim Advanced ({instances[0].Name})");
            message = $"{instances[0].Name} - {i.OperatingState}";
            return AdvOutcome.Connected;
        }
        // SimulationInitializationException (code -1 : IPC refuse, PLCSim eleve)
        // ne derive pas de SimulationRuntimeException : les deux sont a traiter.
        catch (Exception ex) when (ex is Siemens.Simatic.Simulation.Runtime.SimulationRuntimeException
                                   || ex is Siemens.Simatic.Simulation.Runtime.SimulationInitializationException)
        {
            message = $"{ex.GetType().Name}: {ex.Message}";
            return AdvOutcome.Refused;
        }
    }

    Siemens.Simatic.Simulation.Runtime.IIOArea? Area(char a)
    {
        var i = (Siemens.Simatic.Simulation.Runtime.IInstance)inst;
        return a switch { 'I' => i.InputArea, 'Q' => i.OutputArea, 'M' => i.MarkerArea, _ => null };
    }

    public Dictionary<string, object> ReadMany(IReadOnlyList<PlcAddr> vars)
    {
        var res = new Dictionary<string, object>();
        foreach (var v in vars)
        {
            try
            {
                var area = Area(v.Area);
                if (area == null) continue;
                if (v.IsWord)
                {
                    var b = area.ReadBytes((uint)v.ByteOff, 2);
                    res[v.Addr] = (int)(short)((b[0] << 8) | b[1]);
                }
                else res[v.Addr] = area.ReadBit((uint)v.ByteOff, (byte)v.BitOff);
            }
            catch { }
        }
        return res;
    }

    public void Write(PlcAddr a, object value)
    {
        var area = Area(a.Area);
        if (area == null) return;
        if (a.IsWord)
        {
            short s = Convert.ToInt16(value);
            area.WriteBytes((uint)a.ByteOff, new[] { (byte)(s >> 8), (byte)(s & 0xFF) });
        }
        else area.WriteBit((uint)a.ByteOff, (byte)a.BitOff, Convert.ToBoolean(value));
    }

    public void Dispose() { }
}

// ====================================================================
// DORSAL 2 : protocole S7 / Ethernet (S7.Net)
// Automate reel (activer PUT/GET dans la CPU) ou NetToPLCSim.
// Les lectures sont groupees par plages d'octets : 1 requete par zone
// et par plage, au lieu d'une par variable.
// ====================================================================
sealed class S7Backend : IPlcBackend
{
    readonly string ip;
    readonly int port;
    readonly short rack, slot;
    readonly object sync = new();
    S7.Net.Plc? plc;
    DateTime lastAttempt = DateTime.MinValue;
    // Octets fantomes des zones ecrites bit a bit : l'ecriture "bit" du
    // protocole S7 n'est pas comprise par tous les equipements, on ecrit
    // donc l'octet entier (le simulateur est seul maitre de ses octets d'entree).
    readonly Dictionary<(char, int), byte> shadow = new();

    public string LastError { get; private set; } = "";
    public string Name => $"S7 {ip}{(port != 102 ? ":" + port : "")} (rack {rack}, slot {slot})";
    public int RewritePeriod => 100; // toutes les 5 s : chaque ecriture est un aller-retour reseau

    public bool Connected { get { lock (sync) return plc != null && plc.IsConnected; } }

    /// <param name="target">"192.168.0.1" ou "192.168.0.1:1102" (port S7 par defaut : 102)</param>
    public S7Backend(string target, int rack, int slot)
    {
        Target = target;
        var parts = target.Split(':');
        ip = parts[0];
        port = parts.Length > 1 && int.TryParse(parts[1], out var p) ? p : 102;
        this.rack = (short)rack; this.slot = (short)slot;
    }

    public string Target { get; }
    public bool SameTarget(string target, int rack, int slot) => Target == target && this.rack == rack && this.slot == slot;

    S7.Net.Plc? pending;   // objet en cours d'ouverture (ferme au depassement du delai)
    bool timedOut;

    /// <summary>Ouverture bornee : S7.Net peut rester sans reponse si la poignee de main S7
    /// n'aboutit pas (ex. NetToPLCsim sans PLCSIM joignable derriere).</summary>
    public bool Connect(int timeoutSeconds = 6)
    {
        if (pending != null) return false; // deja une tentative en cours
        lastAttempt = DateTime.UtcNow;
        timedOut = false;
        var p = new S7.Net.Plc(S7.Net.CpuType.S71500, ip, port, rack, slot)
        {
            ReadTimeout = 2000,
            WriteTimeout = 2000
        };
        pending = p;
        var t = Task.Run(() =>
        {
            try
            {
                p.Open();
                lock (sync)
                {
                    try { plc?.Close(); } catch { }
                    plc = p;
                    shadow.Clear();
                }
                if (!timedOut) LastError = "";
                return p.IsConnected;
            }
            catch (Exception ex)
            {
                if (!timedOut) LastError = ex.InnerException?.Message ?? ex.Message;
                try { p.Close(); } catch { }
                return false;
            }
            finally { pending = null; }
        });
        if (t.Wait(TimeSpan.FromSeconds(timeoutSeconds))) return t.Result;
        timedOut = true;
        LastError = $"pas de reponse S7 en {timeoutSeconds} s (TCP ouvert mais poignee de main S7 sans reponse : PLCSIM/NetToPLCsim ou PUT/GET ?)";
        try { p.Close(); } catch { }
        return false;
    }

    void Drop(Exception ex)
    {
        LastError = ex.InnerException?.Message ?? ex.Message;
        Console.WriteLine($"[S7] Liaison perdue : {LastError}");
        if (Environment.GetEnvironmentVariable("PLCBRIDGE_DEBUG") == "1") Console.WriteLine(ex.ToString());
        try { plc?.Close(); } catch { }
        plc = null;
    }

    void EnsureConnected()
    {
        if (Connected || pending != null) return;
        if ((DateTime.UtcNow - lastAttempt).TotalSeconds < 3) return;
        if (Connect(4)) Console.WriteLine($"[S7] Reconnecte a {ip}");
    }

    static S7.Net.DataType? TypeOf(char area) => area switch
    {
        'I' => S7.Net.DataType.Input,
        'Q' => S7.Net.DataType.Output,
        'M' => S7.Net.DataType.Memory,
        _ => null
    };

    public Dictionary<string, object> ReadMany(IReadOnlyList<PlcAddr> vars)
    {
        var res = new Dictionary<string, object>();
        EnsureConnected();
        lock (sync)
        {
            if (plc == null) return res;
            foreach (var grp in vars.GroupBy(v => v.Area))
            {
                var dt = TypeOf(grp.Key);
                if (dt == null) continue;
                var list = grp.OrderBy(v => v.ByteOff).ToList();
                var chunk = new List<PlcAddr>();
                int start = 0, end = 0;
                foreach (var v in list)
                {
                    int vEnd = v.ByteOff + (v.IsWord ? 2 : 1);
                    if (chunk.Count > 0 && v.ByteOff - end > 32)
                    {
                        if (!ReadChunk(dt.Value, start, end, chunk, res)) return res;
                        chunk.Clear();
                    }
                    if (chunk.Count == 0) { start = v.ByteOff; end = vEnd; }
                    end = Math.Max(end, vEnd);
                    chunk.Add(v);
                }
                if (chunk.Count > 0 && !ReadChunk(dt.Value, start, end, chunk, res)) return res;
            }
        }
        return res;
    }

    // Appele sous verrou
    bool ReadChunk(S7.Net.DataType dt, int start, int end, List<PlcAddr> chunk, Dictionary<string, object> res)
    {
        try
        {
            var bytes = plc!.ReadBytes(dt, 0, start, end - start);
            foreach (var v in chunk)
            {
                int o = v.ByteOff - start;
                if (v.IsWord) res[v.Addr] = (int)(short)((bytes[o] << 8) | bytes[o + 1]);
                else res[v.Addr] = ((bytes[o] >> v.BitOff) & 1) == 1;
            }
            return true;
        }
        catch (Exception ex) { Drop(ex); return false; }
    }

    public void Write(PlcAddr a, object value)
    {
        var dt = TypeOf(a.Area);
        if (dt == null) return;
        lock (sync)
        {
            if (plc == null) return;
            try
            {
                if (a.IsWord)
                {
                    short s = Convert.ToInt16(value);
                    plc.WriteBytes(dt.Value, 0, a.ByteOff, new[] { (byte)(s >> 8), (byte)(s & 0xFF) });
                }
                else
                {
                    var key = (a.Area, a.ByteOff);
                    if (!shadow.TryGetValue(key, out var cur))
                        cur = plc.ReadBytes(dt.Value, 0, a.ByteOff, 1)[0];
                    byte next = Convert.ToBoolean(value) ? (byte)(cur | (1 << a.BitOff)) : (byte)(cur & ~(1 << a.BitOff));
                    plc.WriteBytes(dt.Value, 0, a.ByteOff, new[] { next });
                    shadow[key] = next;
                }
            }
            catch (Exception ex) { Drop(ex); }
        }
    }

    public void Dispose() { lock (sync) { try { plc?.Close(); } catch { } plc = null; } }
}

// ====================================================================
// SERVEUR
// ====================================================================
class PlcBridge
{
    static IPlcBackend? backend;
    static readonly object backendLock = new();
    static readonly ConcurrentDictionary<string, object> inputCache = new();
    static readonly List<WebSocket> clients = new();
    static readonly object clientsLock = new();
    static readonly ConcurrentDictionary<WebSocket, CancellationTokenSource> pollingCts = new();
    static int cycleCount = 0;
    static string webRoot = "";

    const int EXIT_RELAUNCHED_ELEVATED = 3;

    static readonly Dictionary<string, string> MimeTypes = new()
    {
        [".html"] = "text/html; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".js"] = "application/javascript; charset=utf-8",
        [".json"] = "application/json",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".svg"] = "image/svg+xml",
        [".ico"] = "image/x-icon",
    };

    static async Task<int> Main(string[] args)
    {
        // Avant tout code touchant un type Siemens (le JIT charge l'assembly).
        ApiLoader.Install();
        return await Run(args);
    }

    static string? ArgValue(string[] args, string name)
    {
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    static async Task<int> Run(string[] args)
    {
        int httpPort = 8080;
        int wsPort = 8765;
        Console.OutputEncoding = Encoding.UTF8;

        // Dossier web = premier argument qui est un dossier existant
        webRoot = args.FirstOrDefault(a => !a.StartsWith("--") && Directory.Exists(a)) is string d
            ? Path.GetFullPath(d) : Directory.GetCurrentDirectory();
        if (!File.Exists(Path.Combine(webRoot, "index.html")))
            webRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, ".."));
        if (!File.Exists(Path.Combine(webRoot, "index.html")))
        {
            Console.WriteLine($"ERREUR: index.html introuvable dans {webRoot}");
            Console.WriteLine("Placez l'exe dans le meme dossier que index.html ou passez le chemin en argument.");
            Console.ReadKey();
            return 1;
        }

        bool isElevated = Environment.IsPrivilegedProcess;
        bool noElevate = args.Contains("--no-elevate");
        int parentPid = int.TryParse(ArgValue(args, "--parent"), out var pp) ? pp : -1;
        // Un PlcBridge eleve d'un lancement precedent n'est pas tue par le taskkill
        // non eleve du .bat : chaque instance arrete elle-meme ses ainees (sauf le
        // parent non eleve qui attend pour ouvrir le navigateur).
        KillOtherInstances(parentPid);
        string? plcIp = ArgValue(args, "--plc-ip");
        int rack = int.TryParse(ArgValue(args, "--rack"), out var r) ? r : 0;
        int slot = int.TryParse(ArgValue(args, "--slot"), out var s) ? s : 1;

        Console.WriteLine();
        Console.WriteLine("========================================================");
        Console.WriteLine("   SITRAIN Simulator Web — Serveur tout-en-un (V15)");
        Console.WriteLine("========================================================");
        Console.WriteLine($"  Dossier web: {webRoot}");
        Console.WriteLine($"  Elevation  : {(isElevated ? "Administrateur" : "Utilisateur standard")}");

        if (plcIp != null)
        {
            ConnectS7(plcIp, rack, slot);
        }
        else
        {
            var outcome = PlcSimAdvBackend.TryCreate(out var adv, out var msg);
            Console.WriteLine($"  API DLL : {ApiLoader.Describe()}");
            switch (outcome)
            {
                case AdvOutcome.Connected:
                    backend = adv;
                    Console.WriteLine($"  Mode    : PLC (PLCSim Advanced) - {msg}");
                    break;
                case AdvOutcome.NoInstance:
                    Console.WriteLine("  Mode    : Simulation locale (aucune instance PLCSim Advanced)");
                    Console.WriteLine("  [!] Demarrer une instance dans l'UI Siemens, ou utiliser le mode");
                    Console.WriteLine("      « Automate reel / NetToPLCSim » (adresse IP) dans la page web.");
                    break;
                case AdvOutcome.ApiMissing:
                    Console.WriteLine("  Mode    : Simulation locale (API PLCSim Advanced introuvable)");
                    Console.WriteLine($"      {msg}");
                    Console.WriteLine("  [i] Sans PLCSim Advanced, utiliser le mode « Automate reel / NetToPLCSim »");
                    Console.WriteLine("      (adresse IP) dans la page web, ou lancer avec --plc-ip <ip> [--rack 0 --slot 1].");
                    break;
                case AdvOutcome.Refused:
                    Console.WriteLine($"  PLCSim  : {msg}");
                    if (!isElevated && !noElevate)
                    {
                        Console.WriteLine("  [i] PLCSim semble lance en administrateur : relance du serveur");
                        Console.WriteLine("      en mode administrateur (accepter la popup UAC)...");
                        if (TryRelaunchElevated(args))
                        {
                            // Un processus eleve n'ouvre generalement pas l'URL dans le navigateur
                            // de l'utilisateur : on le fait ici, non eleve, quand le serveur ecoute.
                            Console.WriteLine("  [i] Serveur relance dans une nouvelle fenetre, attente du demarrage...");
                            if (WaitForPort(httpPort, 30000))
                                OpenBrowser(httpPort);
                            else
                                Console.WriteLine($"  [!] Le serveur eleve ne repond pas : ouvrez http://localhost:{httpPort} a la main.");
                            Console.WriteLine("  [i] Cette fenetre va se fermer.");
                            return EXIT_RELAUNCHED_ELEVATED;
                        }
                        Console.WriteLine("  [!] Elevation refusee.");
                    }
                    Console.WriteLine("  Mode    : Simulation locale");
                    Console.WriteLine("  [!] L'API PLCSim Advanced a refuse la connexion. Causes probables :");
                    Console.WriteLine("      - PLCSim Advanced eleve et invite UAC refusee.");
                    Console.WriteLine("      - Mismatch de version entre DLL chargee et PLCSim installe.");
                    Console.WriteLine("      - Utilisateur Windows pas dans le groupe 'Siemens TIA Engineer'.");
                    break;
            }
        }

        Console.WriteLine($"  HTTP    : http://localhost:{httpPort}");
        Console.WriteLine($"  WSocket : ws://localhost:{wsPort}");
        Console.WriteLine("========================================================");
        Console.WriteLine("  Ctrl+C pour arreter");
        Console.WriteLine("========================================================");
        Console.WriteLine();

        var httpListener = StartListener(httpPort);
        Console.WriteLine($"[HTTP] Serveur web demarre sur le port {httpPort}");
        var wsListener = StartListener(wsPort);
        Console.WriteLine($"[WS]   Serveur WebSocket demarre sur le port {wsPort}");

        // Relance eleve : c'est le lanceur non eleve qui ouvre le navigateur.
        if (noElevate)
            Console.WriteLine($"[APP]  Page : http://localhost:{httpPort} (ouverte par la fenetre de lancement)");
        else
            OpenBrowser(httpPort);

        var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

        var httpTask = RunHttpServer(httpListener, cts.Token);
        var wsTask = RunWsServer(wsListener, cts.Token);
        try { await Task.WhenAny(httpTask, wsTask); } catch { }

        backend?.Dispose();
        Console.WriteLine("[Serveur] Arrete.");
        return 0;
    }

    static HttpListener StartListener(int port)
    {
        var l = new HttpListener();
        try { l.Prefixes.Add($"http://+:{port}/"); l.Start(); return l; }
        catch
        {
            l.Close();
            l = new HttpListener();
            l.Prefixes.Add($"http://localhost:{port}/");
            l.Start();
            return l;
        }
    }

    static void ConnectS7(string ip, int rack, int slot)
    {
        lock (backendLock)
        {
            if (backend is S7Backend cur && cur.SameTarget(ip, rack, slot) && cur.Connected)
                return;
            var s7 = new S7Backend(ip, rack, slot);
            Console.WriteLine($"[S7] Connexion a {s7.Name}...");
            bool ok = s7.Connect(6);
            Console.WriteLine(ok ? $"[S7] Connecte : {s7.Name}" : $"[S7] Echec : {s7.LastError} (nouvel essai toutes les 3 s)");
            var old = backend;
            backend = s7;
            old?.Dispose();
        }
        if (backend?.Connected == true) RewriteInputCache();
    }

    /// <summary>Arrete les autres PlcBridge.exe (sauf soi-meme et le parent qui nous a relance).</summary>
    static void KillOtherInstances(int parentPid)
    {
        int me = Environment.ProcessId;
        foreach (var p in Process.GetProcessesByName("PlcBridge"))
        {
            using (p)
            {
                if (p.Id == me || p.Id == parentPid) continue;
                try { p.Kill(); p.WaitForExit(3000); Console.WriteLine($"  [i] Ancien PlcBridge (PID {p.Id}) arrete."); }
                catch (Exception ex) { Console.WriteLine($"  [!] Ancien PlcBridge (PID {p.Id}) non arrete ({ex.GetType().Name})."); }
            }
        }
    }

    static bool WaitForPort(int port, int timeoutMs)
    {
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < timeoutMs)
        {
            try { using var c = new TcpClient(); c.Connect(IPAddress.Loopback, port); return true; }
            catch (SocketException) { Thread.Sleep(250); }
        }
        return false;
    }

    static void OpenBrowser(int httpPort)
    {
        try
        {
            Process.Start(new ProcessStartInfo { FileName = $"http://localhost:{httpPort}", UseShellExecute = true });
            Console.WriteLine("[APP]  Navigateur ouvert");
        }
        catch { Console.WriteLine($"[APP]  Ouvrez http://localhost:{httpPort} dans votre navigateur"); }
    }

    static bool TryRelaunchElevated(string[] args)
    {
        var exe = Environment.ProcessPath;
        if (string.IsNullOrEmpty(exe)) return false;
        var quoted = args.Select(a => "\"" + a.TrimEnd('\\') + "\"").ToList();
        quoted.Add("--no-elevate");
        quoted.Add("--parent");
        quoted.Add(Environment.ProcessId.ToString());
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = exe,
                Arguments = string.Join(" ", quoted),
                WorkingDirectory = Directory.GetCurrentDirectory(),
                UseShellExecute = true,
                Verb = "runas"
            });
            return true;
        }
        catch (Win32Exception) { return false; }
    }

    // ================================================================
    // HTTP
    // ================================================================
    static async Task RunHttpServer(HttpListener listener, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var ctx = await listener.GetContextAsync();
                _ = Task.Run(() => ServeFile(ctx), ct);
            }
            catch when (ct.IsCancellationRequested) { break; }
            catch { }
        }
    }

    static void ServeFile(HttpListenerContext ctx)
    {
        var path = ctx.Request.Url?.LocalPath ?? "/";
        if (path == "/") path = "/index.html";
        var filePath = Path.GetFullPath(Path.Combine(webRoot, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));

        if (filePath.StartsWith(webRoot, StringComparison.OrdinalIgnoreCase) && File.Exists(filePath))
        {
            var ext = Path.GetExtension(filePath).ToLower();
            var content = File.ReadAllBytes(filePath);
            ctx.Response.ContentType = MimeTypes.GetValueOrDefault(ext, "application/octet-stream");
            ctx.Response.ContentLength64 = content.Length;
            ctx.Response.StatusCode = 200;
            ctx.Response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");
            ctx.Response.OutputStream.Write(content, 0, content.Length);
        }
        else
        {
            ctx.Response.StatusCode = 404;
            var msg = Encoding.UTF8.GetBytes("404 Not Found");
            ctx.Response.OutputStream.Write(msg, 0, msg.Length);
        }
        ctx.Response.Close();
    }

    // ================================================================
    // WEBSOCKET
    // ================================================================
    static async Task RunWsServer(HttpListener listener, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var ctx = await listener.GetContextAsync();
                if (ctx.Request.IsWebSocketRequest)
                {
                    var wsCtx = await ctx.AcceptWebSocketAsync(null);
                    _ = HandleClient(wsCtx.WebSocket, ct);
                }
                else { ctx.Response.StatusCode = 400; ctx.Response.Close(); }
            }
            catch when (ct.IsCancellationRequested) { break; }
            catch { }
        }
    }

    static Task SendStatus(WebSocket ws, CancellationToken ct)
    {
        var b = backend;
        bool connected = b?.Connected == true;
        string message = connected ? "" :
            b is S7Backend s7 && s7.LastError != "" ? $"S7 : {s7.LastError}" : "Le serveur repond mais aucun automate n'est connecte";
        return SendJson(ws, new Dictionary<string, object>
        {
            ["type"] = "status",
            ["plc_connected"] = connected,
            ["plc_ip"] = b?.Name ?? "",
            ["backend"] = b is S7Backend ? "s7" : b is PlcSimAdvBackend ? "plcsim_adv" : "none",
            ["mode"] = connected ? "plc" : "simulation",
            ["message"] = message
        }, ct);
    }

    static async Task HandleClient(WebSocket ws, CancellationToken ct)
    {
        lock (clientsLock) { clients.Add(ws); }
        Console.WriteLine("[WS] Client connecte");
        try
        {
            await SendStatus(ws, ct);
            var buffer = new byte[8192];
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                if (result.MessageType == WebSocketMessageType.Close) break;
                await HandleMessage(ws, Encoding.UTF8.GetString(buffer, 0, result.Count), ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Console.WriteLine($"[WS] Erreur: {ex.Message}");
        }
        finally
        {
            lock (clientsLock) { clients.Remove(ws); }
            if (pollingCts.TryRemove(ws, out var oldCts)) oldCts.Cancel();
            Console.WriteLine("[WS] Client deconnecte");
        }
    }

    static async Task HandleMessage(WebSocket ws, string message, CancellationToken ct)
    {
        JsonDocument doc;
        try { doc = JsonDocument.Parse(message); } catch { return; }
        var root = doc.RootElement;
        if (!root.TryGetProperty("type", out var typeProp)) return;

        switch (typeProp.GetString())
        {
            case "write":
                WriteVariable(root.GetProperty("addr").GetString()!, ReadJsonValue(root.GetProperty("value")));
                break;

            case "write_batch":
                foreach (var item in root.GetProperty("variables").EnumerateArray())
                    WriteVariable(item.GetProperty("addr").GetString()!, ReadJsonValue(item.GetProperty("value")));
                break;

            case "subscribe":
                {
                    if (pollingCts.TryRemove(ws, out var oldCts)) oldCts.Cancel();
                    var addresses = root.GetProperty("addresses").EnumerateArray()
                        .Select(a => a.GetString()!).ToList();
                    var pollCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    pollingCts[ws] = pollCts;
                    _ = PollingLoop(ws, addresses, pollCts.Token);
                    break;
                }

            case "connect_plc":
                {
                    var ip = root.TryGetProperty("ip", out var ipP) ? ipP.GetString() : null;
                    int rack = root.TryGetProperty("rack", out var rP) && rP.TryGetInt32(out var rv) ? rv : 0;
                    int slot = root.TryGetProperty("slot", out var sP) && sP.TryGetInt32(out var sv) ? sv : 1;
                    if (!string.IsNullOrWhiteSpace(ip))
                        await Task.Run(() => ConnectS7(ip.Trim(), rack, slot), ct);
                    await SendStatus(ws, ct);
                    break;
                }

            case "status":
                await SendStatus(ws, ct);
                break;
        }
    }

    static object ReadJsonValue(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => el.GetInt32(),
        _ => false
    };

    // ================================================================
    // VARIABLES
    // ================================================================
    static PlcAddr? ParseAddress(string addr)
    {
        var a = addr.Trim().Replace("%", "").ToUpperInvariant();
        if (a.Length < 3) return null;
        char area = a[0];
        if (area != 'I' && area != 'Q' && area != 'M') return null;
        if (a[1] == 'W')
            return int.TryParse(a.AsSpan(2), out var w) ? new PlcAddr(addr, area, w, -1, true) : null;
        var parts = a.Substring(1).Split('.');
        if (parts.Length == 2 && int.TryParse(parts[0], out var by) && int.TryParse(parts[1], out var bit) && bit >= 0 && bit <= 7)
            return new PlcAddr(addr, area, by, bit, false);
        return null;
    }

    static void WriteVariable(string addr, object value)
    {
        if (ParseAddress(addr) is not PlcAddr a) return;
        if (a.Area == 'I') inputCache[addr] = value;
        var b = backend;
        if (b == null || !b.Connected) return;
        try { b.Write(a, value); }
        catch (Exception ex) { Console.WriteLine($"[PLC] Erreur ecriture {addr}: {ex.Message}"); }
    }

    static void RewriteInputCache()
    {
        var b = backend;
        if (b == null || !b.Connected) return;
        foreach (var kvp in inputCache)
        {
            if (ParseAddress(kvp.Key) is not PlcAddr a || a.Area != 'I') continue;
            try { b.Write(a, kvp.Value); } catch { }
        }
    }

    // ================================================================
    // POLLING
    // ================================================================
    static bool ValuesEqual(object a, object b)
    {
        if (a is bool ba && b is bool bb) return ba == bb;
        if (a is int ia && b is int ib) return ia == ib;
        return Equals(a, b);
    }

    static async Task PollingLoop(WebSocket ws, List<string> addresses, CancellationToken ct)
    {
        var vars = addresses.Select(ParseAddress).Where(a => a != null).Select(a => a!.Value).ToList();
        Console.WriteLine($"[POLL] Demarrage polling pour {vars.Count} variables");
        var prevValues = new Dictionary<string, object>();

        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            try
            {
                var b = backend;
                var read = b != null && b.Connected ? b.ReadMany(vars) : new Dictionary<string, object>();
                if (b != null && b.Connected && cycleCount % Math.Max(1, b.RewritePeriod) == 0)
                    RewriteInputCache();

                var current = new Dictionary<string, object>();
                var changed = new Dictionary<string, object>();
                foreach (var v in vars)
                {
                    object val = read.TryGetValue(v.Addr, out var rv) ? rv : (v.IsWord ? 0 : false);
                    current[v.Addr] = val;
                    if (!prevValues.TryGetValue(v.Addr, out var pv) || !ValuesEqual(pv, val))
                        changed[v.Addr] = val;
                }
                if (cycleCount % 10 == 0) changed = current;

                if (changed.Count > 0)
                    await SendJson(ws, new Dictionary<string, object>
                    {
                        ["type"] = "update",
                        ["variables"] = changed,
                        ["cycle"] = cycleCount
                    }, ct);

                prevValues = current;
                cycleCount++;
                await Task.Delay(50, ct);
            }
            catch (Exception) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                Console.WriteLine($"[POLL] Erreur: {ex.Message}");
                await Task.Delay(500, ct);
            }
        }
        Console.WriteLine("[POLL] Polling arrete");
    }

    static async Task SendJson(WebSocket ws, object data, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data));
        if (ws.State == WebSocketState.Open)
            await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct);
    }
}

// ====================================================================
// CHARGEMENT DE L'API SIEMENS, INDEPENDANT DE LA VERSION
// Le pont est compile contre une version donnee de la DLL ; .NET refuse
// par defaut une DLL d'assembly-version inferieure. Ce chargeur
// intercepte l'echec et charge la DLL disponible : a cote de l'exe,
// sinon la plus haute version de Common Files\Siemens\PLCSIMADV\API\.
// ====================================================================
static class ApiLoader
{
    const string ApiName = "Siemens.Simatic.Simulation.Runtime.Api.x64";
    static string loadedFrom = "(par defaut, a cote de l'exe)";

    public static string Describe()
    {
        var asm = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == ApiName);
        return asm == null ? "non chargee" : $"{asm.GetName().Version} — {loadedFrom}";
    }

    public static void Install()
    {
        AssemblyLoadContext.Default.Resolving += (ctx, name) =>
        {
            if (name.Name != ApiName) return null;
            foreach (var path in Candidates())
            {
                try
                {
                    var asm = ctx.LoadFromAssemblyPath(path);
                    loadedFrom = path;
                    Console.WriteLine($"  [API] Version compilee {name.Version} absente : DLL {asm.GetName().Version} chargee depuis");
                    Console.WriteLine($"        {path}");
                    return asm;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"  [API] Echec {path} : {ex.GetType().Name} {ex.Message}");
                }
            }
            Console.WriteLine("  [API] Aucune DLL Siemens.Simatic.Simulation.Runtime.Api.x64.dll trouvee.");
            return null;
        };
    }

    static IEnumerable<string> Candidates()
    {
        var local = Path.Combine(AppContext.BaseDirectory, ApiName + ".dll");
        if (File.Exists(local)) yield return local;

        var common = Environment.GetEnvironmentVariable("CommonProgramFiles(x86)") ?? @"C:\Program Files (x86)\Common Files";
        var apiRoot = Path.Combine(common, "Siemens", "PLCSIMADV", "API");
        if (!Directory.Exists(apiRoot)) yield break;

        var versions = Directory.GetDirectories(apiRoot)
            .Select(d => (dir: d, ver: Version.TryParse(Path.GetFileName(d), out var v) ? v : null))
            .Where(t => t.ver != null)
            .OrderByDescending(t => t.ver);
        foreach (var t in versions)
        {
            var p = Path.Combine(t.dir, ApiName + ".dll");
            if (File.Exists(p)) yield return p;
        }
    }
}
