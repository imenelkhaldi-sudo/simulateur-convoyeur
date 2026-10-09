# SITRAIN Simulator Web — Documentation

## Description

SITRAIN Simulator Web est une application de simulation d'un convoyeur industriel Siemens pour la formation SITRAIN. Elle reproduit un tapis roulant avec capteurs, boutons, LEDs et moteurs, pilotable par un automate virtuel via PLCSim Advanced.

L'application se compose de :
- Une **interface web** (HTML/CSS/JS) affichant le convoyeur et le panneau de controle
- Un **serveur passerelle** (.NET/C#) qui fait le pont entre le navigateur et PLCSim Advanced via l'API officielle Siemens

---

## Prerequis a installer

### 1. .NET 8.0 Runtime (obligatoire)

Le serveur passerelle necessite le runtime .NET 8.0 ou superieur.

- Telecharger : https://dotnet.microsoft.com/download/dotnet/8.0
- Installer le **".NET Runtime 8.0"** (x64)
- Verification : ouvrir un terminal et taper `dotnet --list-runtimes`

### 2. PLCSim Advanced V3.0 ou superieur (obligatoire pour le mode PLC)

L'application utilise l'API officielle Siemens PLCSim Advanced pour communiquer avec l'automate virtuel.

- PLCSim Advanced est installe avec TIA Portal (option a cocher lors de l'installation)
- Versions supportees : V3.0 a V8.0
- L'API Siemens (`Siemens.Simatic.Simulation.Runtime.Api.x64.dll`) doit etre presente dans `C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\`

### 3. TIA Portal (obligatoire)

Pour creer et charger le programme automate dans PLCSim Advanced.

- Versions supportees : V17, V18, V19, V20, V21
- Le projet doit contenir un automate S7-1500 ou ET200SP

### 4. Navigateur web moderne (obligatoire)

- Firefox, Chrome, ou Edge (version recente)
- JavaScript doit etre active

---

## Configuration du projet TIA Portal

### Adresses E/S

L'application supporte deux configurations d'adressage :

#### Mode S7-1500 (E/S centralisees)

| Fonction | Adresse | Description |
|---|---|---|
| Panneau - Entrees | I0.0 - I0.7 | Interrupteurs (BP_Arret, BP_Marche, etc.) |
| Panneau - Sorties | Q0.0 - Q0.7 | LEDs (Q_En_Service, defauts, modes) |
| TopLights | Q2.0 - Q2.3 | Voyants colonne lumineuse |
| Convoyeur - Capteurs | I3.0, I3.5 - I3.7 | Capteur optique + 3 capteurs ILS |
| Convoyeur - BP Postes | I3.1 - I3.4 | Boutons poussoirs aux postes |
| Convoyeur - Sorties | Q3.1 - Q3.4 | Voyants aux postes |
| Convoyeur - Moteurs | Q3.5 (K_Droite), Q3.6 (K_Gauche) | Commande moteur |
| Analogique | IW10, IW30 | Entrees analogiques (curseurs) |
| Analogique | QW32, QW34 | Sorties analogiques (afficheurs) |

#### Mode ET200SP (E/S decentralisees)

Meme chose sauf le convoyeur qui utilise **I4.x / Q4.x** au lieu de I3.x / Q3.x.

### Variables importantes

| Variable | Adresse (S7-1500) | Adresse (ET200SP) | Type | Description |
|---|---|---|---|---|
| BP_Arret | I0.0 | I0.0 | NF (normalement ferme) | Bouton arret - TRUE au repos |
| BP_En_Service | I0.1 | I0.1 | Toggle | Mise en service |
| BP_Droite | I0.2 | I0.2 | Momentary | Commande droite manuelle |
| BP_Gauche | I0.3 | I0.3 | Momentary | Commande gauche manuelle |
| B_Ini1 | I3.5 | I4.5 | Auto | Capteur ILS poste 1 |
| B_Ini2 | I3.6 | I4.6 | Auto | Capteur ILS poste 2 |
| B_Ini3 | I3.7 | I4.7 | Auto | Capteur ILS poste 3 |
| B_LS | I3.0 | I4.0 | Auto (NF) | Barriere optique - TRUE = faisceau intact |
| K_Droite | Q3.5 | Q4.5 | Sortie | Moteur convoyeur sens droite |
| K_Gauche | Q3.6 | Q4.6 | Sortie | Moteur convoyeur sens gauche |

### Temporisateurs

Le simulateur web introduit une latence de communication (~100-200ms). Il est recommande d'augmenter les temporisateurs de surveillance dans le programme PLC :
- **Temporisateur de surveillance du tapis** : minimum 15-20 secondes (au lieu de 7s sur le convoyeur reel)

---

## Installation de l'application

### Etape 1 : Copier les fichiers

Copier le dossier `SITRAINSim-WebApp` sur le PC. La structure du dossier doit etre :

```
SITRAINSim-WebApp/
  index.html
  app.js
  simulator.js
  exercises.js
  style.css
  SITRAINSim.bat          <-- Lanceur principal
  publish/
    PlcBridge.exe          <-- Serveur passerelle
    PlcBridge.dll
    Siemens.Simatic.Simulation.Runtime.Api.x64.dll
    ...
```

### Etape 2 : Verifier les prerequis

1. Ouvrir un terminal et verifier que .NET est installe : `dotnet --list-runtimes`
2. Verifier que PLCSim Advanced est installe et que l'API DLL est presente

---

## Utilisation

### Demarrage

1. **Lancer PLCSim Advanced** et demarrer une instance avec votre projet TIA Portal
2. **Double-cliquer sur `SITRAINSim.bat`** — le serveur demarre et le navigateur s'ouvre automatiquement

Le terminal affiche :
```
========================================================
   SITRAIN Simulator Web — Serveur tout-en-un
========================================================
  Instances PLCSim: 1
  Instance: <nom_instance>
  Mode    : PLC (PLCSim Advanced) - Run
  HTTP    : http://localhost:8080
  WSocket : ws://localhost:8765
========================================================
```

### Connexion au PLC

1. Dans l'application web, cliquer sur **Connexion**
2. Selectionner **"PLCSim / PLC reel via serveur"**
3. Laisser le port WebSocket a **8765**
4. Cliquer **Connecter**
5. Le voyant de statut passe au **vert** : "PLC Connecte"

### Selection du modele PLC

En haut a droite du convoyeur, selectionner le modele correspondant a votre projet :
- **S7-1500** : pour les E/S centralisees (convoyeur sur I3.x / Q3.x)
- **ET200SP** : pour les E/S decentralisees (convoyeur sur I4.x / Q4.x)

**Important** : selectionner le modele PLC **avant** de se connecter au PLC.

### Selection de l'exercice

Dans la barre d'outils, utiliser le menu deroulant pour selectionner l'exercice SITRAIN :
- TIA-PRO1, TIA-PRO2, TIA-GRAPH, TIA-SERV1, TIA-SERV2, etc.

Chaque exercice configure les noms symboliques des variables.

### Utilisation du convoyeur

- **Placer une piece** : cliquer sur les boutons "Placer une piece" sous les capteurs ILS
- **Retirer une piece** : cliquer directement sur la piece sur le tapis
- **Boutons poussoirs** (BP_Poste1-4) : cliquer sur les cercles jaunes en bas du convoyeur (maintenir appuye)

### Panneau de controle

Cliquer sur **"Panneau de controle"** dans la barre d'outils pour ouvrir/fermer le panneau flottant :
- **Interrupteurs** (I0.0 - I0.7) : cliquer pour basculer (toggle) ou maintenir (momentary)
- **LEDs** (Q0.0 - Q0.7) : s'allument selon les sorties du PLC
- **TopLights** (Q2.0 - Q2.3) : voyants colonne lumineuse
- **Curseurs** (IW10, IW30) : entrees analogiques
- **Afficheurs** (QW32, QW34) : sorties analogiques

### Mode d'affichage des adresses

Cliquer sur **"Affichage"** dans la barre d'outils pour choisir :
- **Absolu** : I3.5, Q3.1, IW10
- **Symbolique** : B_Ini1, Q_Poste1, Curseur_1
- **Absolu + Symbolique** : les deux

### Raccourcis clavier

| Touche | Action |
|---|---|
| Espace | Placer une piece au poste 1 |
| P | Ouvrir/fermer le panneau de controle |
| Echap | Fermer les fenetres |

---

## Depannage

### Le serveur affiche "Aucune instance PLCSim trouvee"

- Verifier que PLCSim Advanced est lance et qu'une instance est en cours d'execution (etat "Run")
- Lancer PLCSim Advanced **avant** le serveur
- Si le probleme persiste, relancer PLCSim Advanced en mode administrateur

### Le navigateur affiche "Attente du serveur WebSocket"

- Verifier que le serveur (terminal) est bien en cours d'execution
- Verifier que le port 8765 n'est pas bloque par un pare-feu
- Verifier qu'aucun autre programme n'utilise le port 8765

### Les entrees (I) ne changent pas dans TIA Portal

- Verifier que l'instance PLCSim est en mode "Run"
- Le serveur doit afficher "Mode : PLC" (pas "Simulation locale")

### Les sorties (Q) ne s'affichent pas dans l'application

- Verifier que le bon modele PLC est selectionne (S7-1500 ou ET200SP)
- Selectionner le modele **avant** de se connecter
- Si le modele a ete change apres connexion, rafraichir la page (Ctrl+Shift+R) et reconnecter

### La piece se deplace trop lentement / le defaut tapis se declenche

- Augmenter le temporisateur de surveillance du tapis dans le programme PLC (recommande : 20 secondes minimum)
- La latence du simulateur web est plus elevee qu'un convoyeur reel

### Impossible de charger le projet TIA Portal dans PLCSim

- **Arreter le serveur** (fermer le terminal SITRAINSim) avant de charger
- Le serveur maintient une connexion avec PLCSim qui peut bloquer le chargement
- Relancer le serveur apres le chargement

### "localhost refuse la connexion" dans le navigateur

- Verifier que le serveur est bien lance (terminal actif)
- Essayer http://127.0.0.1:8080 au lieu de http://localhost:8080

---

## Architecture technique

```
 Navigateur web                    PlcBridge.exe                PLCSim Advanced
+------------------+    HTTP     +------------------+          +----------------+
| index.html       |<---------->| Serveur HTTP     |          |                |
| app.js           |  :8080     | (fichiers web)   |          |  Instance PLC  |
| simulator.js     |            |                  |  Siemens |  (S7-1500 /    |
| exercises.js     | WebSocket  | Serveur WS       |   API    |   ET200SP)     |
| style.css        |<---------->| (E/S temps reel) |<-------->|                |
+------------------+  :8765     +------------------+  DLL     +----------------+
```

- **HTTP (port 8080)** : sert les fichiers de l'application web
- **WebSocket (port 8765)** : communication bidirectionnelle temps reel des E/S
- **API Siemens** : lecture/ecriture des zones d'E/S via `InputArea` / `OutputArea`

---

## Exercices disponibles

| Code | Description |
|---|---|
| TIA-PRO1 | Programmation de base : Marche/Arret, defauts, modes manuel/auto |
| TIA-PRO2 | Programmation avancee : Hors service/En service, poids, modes |
| TIA-GRAPH | Programmation GRAPH : sequenceur |
| TIA-SERV1 | Maintenance niveau 1 |
| TIA-SERV2 | Maintenance niveau 2 |
| TIA-SYSUP | Mise a jour systeme |
| CPT-FAP | Comptage rapide |
| CTP-FAST1 | Comptage rapide avance |
| TIA-PRI1 | Programmation industrielle 1 |
| TIA-PJ2 | Projet 2 |
| TIA-SPEC1 | Specialisation 1 |
| TIA-SPEC2 | Specialisation 2 |

---

*Version 1.0 — SITRAIN Simulator Web*
