# SITRAIN Simulator Web — build « SimulateurV15 »

Même application web que `SITRAINSim-WebApp`, avec un pont `publish/PlcBridge.exe` qui sait
piloter **trois types d'automate** :

| Mode (dialogue « Connexion ») | Cible | Prérequis sur le poste |
|---|---|---|
| PLCSim Advanced (via serveur) | instance PLCSim Advanced **V2.0 à V8.0** | PLCSim Advanced installé (TIA V15 ou plus) |
| Automate réel ou NetToPLCSim — S7 Ethernet | CPU **S7-1500 / ET200SP réelle** | PUT/GET activé dans la CPU, câble Ethernet |
| Automate réel ou NetToPLCSim — S7 Ethernet | **S7-PLCSIM classique** (livré avec TIA) | NetToPLCSim lancé, IP de NetToPLCSim |
| Simulation locale | aucun automate | — |

Dans tous les cas : **.NET Runtime 8.0 x64** (https://dotnet.microsoft.com/download/dotnet/8.0),
Windows 10 version 1607 ou plus récent. Windows 7 n'est pas pris en charge par .NET 8.

## Lancement

- `SITRAINSim.bat` : démarre le serveur ; s'il trouve une instance PLCSim Advanced, il s'y
  connecte, sinon il attend le choix du mode dans la page (http://localhost:8080).
- `SITRAINSim_S7.bat` : demande l'adresse IP (et rack/slot) de l'automate et démarre
  directement en mode S7. Équivalent : `publish\PlcBridge.exe . --plc-ip 192.168.0.1 --rack 0 --slot 1`.
- Dans la page : Connexion → choisir le mode → (S7 : IP, rack, slot) → Connecter.
  Un port autre que 102 se note `IP:port` (ex. `127.0.0.1:1102`).

Choisir le modèle PLC (S7-1500 / ET200SP) **avant** de se connecter : il fixe les adresses du
convoyeur (I3.x/Q3.x ou I4.x/Q4.x). Voir `Documentation.md` pour les adresses E/S.

## Mode S7 : ce qu'il faut savoir

- **CPU réelle** : dans TIA Portal, propriétés de la CPU → Protection & sécurité → Mécanismes de
  connexion → cocher « Autoriser l'accès via communication PUT/GET ». Rack 0, slot 1.
- **Entrées** : le simulateur écrit dans la zone I. Sur une CPU réelle, un module d'entrées
  physique présent à la même adresse écrase ces valeurs à chaque cycle : réserver au simulateur
  des adresses sans module (ou retirer les modules du projet).
- Les entrées sont écrites **octet par octet** (I0, I3/I4, IW10, IW30) : le simulateur est seul
  maître de ces octets, ne pas y mettre d'autres capteurs.
- Le pont regroupe ses lectures par zone (1 requête pour I, 1 pour Q par cycle de 50 ms).
  Sur un réseau chargé, augmenter les temporisateurs de surveillance du programme (20 s).
- Liaison perdue : reconnexion automatique toutes les 3 s, état visible dans la barre de statut.
  Une poignée de main S7 sans réponse est abandonnée après 6 s avec le message « TCP ouvert mais
  poignée de main S7 sans réponse » : l'équipement écoute sur le port 102 mais ne parle pas S7
  (PUT/GET désactivé, NetToPLCsim sans PLCSIM joignable derrière, mauvaise IP de CPU simulée).
- **NetToPLCsim** (S7-PLCSIM classique) : outil tiers gratuit de Thomas Wiens, version 1.2.5
  extraite dans `tools/NetToPLCsim/` avec un fichier de station `nettoplcsim_sitrain.ini`
  (interface 192.168.0.128 = adaptateur virtuel PLCSIM, CPU simulée 192.168.0.109, rack 0 slot 1)
  et le lanceur `Lancer_NetToPLCsim.bat` (à exécuter en administrateur : il libère le port 102
  en arrêtant puis relançant le service « S7DOS Help Service »). Adapter l'IP de la CPU simulée
  dans le `.ini` à celle du projet TIA. Dans la page, cibler l'adresse de l'interface (192.168.0.128).
  Prérequis Siemens : point d'accès S7ONLINE réglé sur PLCSIM.TCPIP.1 (fichier
  `ProgramData\Siemens\Automation\Simatic OAM\data\LogNames\S7ONLINE.xml`).

## Mode PLCSim Advanced : chargement de la DLL

Le dossier `publish/` ne contient **pas** de DLL d'API Siemens. Au démarrage le pont charge
`Siemens.Simatic.Simulation.Runtime.Api.x64.dll` :
1. depuis `publish/` si on y copie une DLL (prioritaire) ;
2. sinon depuis `C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\<version la plus haute>\`.

La console affiche `API DLL : <version> — <chemin>`. Sans PLCSim Advanced sur le poste, le pont
démarre quand même et propose le mode S7. Si PLCSim Advanced tourne en administrateur, le pont
se relance en administrateur (invite UAC) et sa première fenêtre se ferme.

## État de validation (2026-09-29)

- Mode PLCSim Advanced : vérifié sur un poste V8.0 avec les DLL d'API 3.0, 5.0, 7.0 et 8.0.
  **Non vérifié avec une vraie DLL V2.0** (indisponible ici). Le pont n'utilise que des
  fonctions présentes depuis V2.0 SP1 (instances, zones I/Q/M en lecture/écriture).
- 2026-10-08, poste BTS (TIA V15, PLCSim Advanced V2.x) : le pont charge la DLL
  `API\2.1` (2.1.0.2701) et se connecte à l'instance en Run. Le navigateur du poste est l'ancien
  Edge (EdgeHTML) : la page n'y fonctionnait pas à cause d'une décomposition d'objet `{ ...v }`
  dans `simulator.js` (corrigée en `Object.assign`). **Ne pas utiliser de syntaxe postérieure à
  ES2017** dans le front (`{...obj}`, `?.`, `??`, `catch {}` sans paramètre, champs de classe).
- Mode S7 : vérifié de bout en bout contre un serveur S7 logiciel (snap7) sur `127.0.0.1:1102` :
  entrées écrites par la page relues côté automate, sorties forcées côté automate affichées
  dans la page, bascule PLCSim Advanced → S7 par le dialogue, démarrage sans aucune API Siemens.
  **Non vérifié contre une CPU réelle.**
- NetToPLCsim 1.2.5 + S7-PLCSIM V21 (S7DOS 9.4) sur le poste de développement : NetToPLCsim accepte
  la connexion ISO, mais la première requête S7 reste sans réponse (S7online ne répond pas).
  Non concluant au 2026-09-29 ; NetToPLCsim n'est documenté que jusqu'à TIA V17/V18.

## Recompiler le pont

```
dotnet publish PlcBridge\PlcBridge.csproj -c Release -r win-x64 --self-contained false -o publish
del publish\Siemens.Simatic.Simulation.Runtime.Api.x64.dll
```
(arrêter `PlcBridge.exe` avant ; SDK .NET 8 et accès NuGet pour le paquet S7netplus).
