# Simulateur de convoyeur — automate Siemens S7

**Démo en ligne : https://imenelkhaldi-sudo.github.io/simulateur-convoyeur/**

Partie opérative virtuelle d'un convoyeur, à piloter par un programme TIA Portal
(PLCSim Advanced, S7-PLCSIM via NetToPLCSim, ou CPU S7-1500 / ET200SP réelle), ou en
simulation locale sans automate.

## Objectif pédagogique

- Programmer et tester un automate Siemens (TIA Portal) sans maquette physique.
- Relier les entrées / sorties d'un programme (%I, %Q) au comportement d'un système réel :
  capteurs, moteur du tapis, pupitre opérateur.
- S'entraîner avec une série d'exercices progressifs (`exercises.js`) et observer
  immédiatement l'effet de son programme sur le convoyeur animé.

## Public visé

- Étudiants de BTS CRSA, de licence professionnelle et de formation continue en automatisme.
- Formateurs qui veulent faire travailler un groupe sur poste sans multiplier les maquettes.

## Technologies

- Interface web : HTML, CSS et JavaScript, sans dépendance (`index.html`, `app.js`,
  `simulator.js`, `exercises.js`).
- Pont automate ⇄ navigateur : application C# / .NET 8 (`PlcBridge/`) qui communique avec la page
  en WebSocket. Il pilote PLCSim Advanced V2.0 à V8.0 via l'API Siemens installée sur le poste,
  ou une CPU en protocole S7 grâce à [S7netplus](https://github.com/S7NetPlus/s7netplus) (licence MIT).
- Développé par Imen MKAOUAR-ELKHALDI avec l'assistance de **Claude** (Anthropic, via Claude Code).

## Utilisation

- **Sans automate** : ouvrir la démo en ligne (ou `index.html`), puis choisir « Simulation locale ».
- **Avec automate** : installer le .NET Runtime 8.0 x64, puis lancer `SITRAINSim.bat`
  (PLCSim Advanced) ou `SITRAINSim_S7.bat` (CPU réelle / NetToPLCSim). La page s'ouvre sur
  http://localhost:8080. Le mode automate ne fonctionne pas depuis la démo en ligne.

Détails : `README_V15.md` (installation et modes de connexion), `Documentation.md` (adresses E/S).

La DLL Siemens `Siemens.Simatic.Simulation.Runtime.Api.x64.dll` n'est **pas** fournie : le pont
charge celle de PLCSim Advanced installé sur le poste. NetToPLCsim n'est pas fourni non plus :
le télécharger depuis son projet d'origine si besoin.

## Avertissement

Projet pédagogique indépendant, non affilié à Siemens AG. SIMATIC, TIA Portal, PLCSIM et SITRAIN
sont des marques de Siemens AG.
