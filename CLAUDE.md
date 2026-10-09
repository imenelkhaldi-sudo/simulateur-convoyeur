# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vue d'ensemble

Fork de `C:\Users\imene\Desktop\SITRAINSim-WebApp` (lire son `CLAUDE.md` pour le front, les
adresses E/S et le protocole WebSocket, identiques ici). Ce dossier existe pour les postes
équipés de versions anciennes (TIA V15 / PLCSim Advanced V2.0) ou **sans PLCSim Advanced**.
`README_V15.md` est le manuel d'installation et l'état de validation : le tenir à jour.

Différences avec le projet d'origine :

- **`PlcBridge/Program.cs` a divergé** : il a deux dorsaux derrière l'interface `IPlcBackend`.
  `PlcSimAdvBackend` (API Siemens, chargée par `ApiLoader` quelle que soit sa version, aucun type
  Siemens dans les champs ni signatures publiques pour que l'exe démarre sans la DLL) et `S7Backend`
  (paquet NuGet S7netplus, protocole S7/ISO-on-TCP : CPU réelle ou NetToPLCSim). Le dorsal actif
  est choisi au démarrage (`--plc-ip IP[:port] [--rack --slot]`, sinon PLCSim Advanced si une instance
  existe) ou à chaud par le message WebSocket `connect_plc {ip, rack, slot}` envoyé par la page.
- `S7Backend` écrit les bits par **octet fantôme** (lecture initiale puis écriture de l'octet complet),
  car l'écriture « bit » du protocole S7 n'est pas comprise par tous les équipements ; il lit par plages
  d'octets fusionnées (trou max 32 octets) et réécrit le cache des entrées toutes les 5 s seulement.
- Front : le dialogue de connexion a un troisième mode `s7` (`index.html`, `conn-s7-options`) ; en mode
  `plcsim` la page n'envoie plus d'IP. Le message `status` porte `backend` (`plcsim_adv` / `s7` / `none`)
  et `plc_ip` contient le libellé affiché dans la barre de statut.
- `S7Backend.Connect(timeout)` ouvre la liaison dans une tâche et abandonne après le délai (S7.Net `Open()`
  n'a pas de délai propre et reste bloqué si la poignée de main S7 n'aboutit pas) ; l'objet en cours
  d'ouverture est fermé, jamais sous le verrou `sync`.
- `publish/` est livré **sans** DLL Siemens (voir README) et **avec** `S7.Net.dll`.
- `tools/NetToPLCsim/` : NetToPLCsim 1.2.5 (binaire + sources + manuel texte), `.ini` de station et
  lanceur. Sur ce poste (S7-PLCSIM V21, S7DOS 9.4) la relayage S7online ne répond pas : voir README.

## Commandes

```bat
SITRAINSim.bat                      REM PLCSim Advanced si instance, sinon choix dans la page
SITRAINSim_S7.bat                   REM demande l'IP et démarre en mode S7
dotnet publish PlcBridge\PlcBridge.csproj -c Release -r win-x64 --self-contained false -o publish
del publish\Siemens.Simatic.Simulation.Runtime.Api.x64.dll
```

Test du mode S7 sans automate : `pip install python-snap7`, serveur `snap7.server.Server()` avec
zones PE/PA/MK enregistrées sur le port 1102 (le 102 est pris par un service Siemens), puis
`PlcBridge.exe . --plc-ip 127.0.0.1:1102`. Variable d'environnement `PLCBRIDGE_DEBUG=1` pour la
trace complète des erreurs S7. Le serveur Python de snap7 3.0 ne reflète pas les tampons passés à
`register_area` : forcer les sorties avec un second client snap7, pas en modifiant le tampon.
