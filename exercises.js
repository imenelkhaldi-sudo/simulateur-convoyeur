/**
 * SITRAIN Simulator — Exercise Definitions
 * Each exercise defines panel I/O and conveyor I/O with DUAL addressing
 * S7-1500: conveyor uses I3.x / Q3.x
 * ET200SP: conveyor uses I4.x / Q4.x
 * Panel (I0.x, Q0.x), TopLights (Q2.x), Analog (IW/QW) are the same for both
 */

// Address configuration per PLC model
const PLC_CONFIG = {
    "S7-1500": {
        panelI: 0,    // Panel inputs: I0.x
        panelQ: 0,    // Panel outputs: Q0.x
        convI: 3,     // Conveyor inputs: I3.x
        convQ: 3,     // Conveyor outputs: Q3.x
        topQ: 2,      // TopLights: Q2.x
        iw1: 10,      // IW10
        iw2: 30,      // IW30
        qw1: 32,      // QW32
        qw2: 34       // QW34
    },
    "ET200SP": {
        panelI: 0,
        panelQ: 0,
        convI: 4,     // Conveyor inputs: I4.x
        convQ: 4,     // Conveyor outputs: Q4.x
        topQ: 2,
        iw1: 10,
        iw2: 30,
        qw1: 32,
        qw2: 34
    }
};

// Helper to build addresses for a given PLC model
function buildAddr(plcModel, type, byte, bit) {
    const cfg = PLC_CONFIG[plcModel];
    if (type === 'panelI') return `I${cfg.panelI}.${bit}`;
    if (type === 'panelQ') return `Q${cfg.panelQ}.${bit}`;
    if (type === 'convI') return `I${cfg.convI}.${bit}`;
    if (type === 'convQ') return `Q${cfg.convQ}.${bit}`;
    if (type === 'topQ') return `Q${cfg.topQ}.${bit}`;
    if (type === 'IW1') return `IW${cfg.iw1}`;
    if (type === 'IW2') return `IW${cfg.iw2}`;
    if (type === 'QW1') return `QW${cfg.qw1}`;
    if (type === 'QW2') return `QW${cfg.qw2}`;
    return '';
}

/**
 * Generate exercise definition with resolved addresses for a given PLC model
 */
function resolveExercise(exDef, plcModel) {
    const cfg = PLC_CONFIG[plcModel];
    const resolved = JSON.parse(JSON.stringify(exDef)); // deep clone

    // Resolve panel inputs
    resolved.panel.inputs.forEach((inp, i) => {
        inp.addr = `I${cfg.panelI}.${i}`;
    });

    // Resolve panel outputs
    resolved.panel.outputs.forEach((out, i) => {
        out.addr = `Q${cfg.panelQ}.${i}`;
    });

    // Resolve topLights
    resolved.panel.topLights.forEach((tl, i) => {
        tl.addr = `Q${cfg.topQ}.${i}`;
    });

    // Resolve analog
    if (resolved.panel.analogInputs[0]) resolved.panel.analogInputs[0].addr = `IW${cfg.iw1}`;
    if (resolved.panel.analogInputs[1]) resolved.panel.analogInputs[1].addr = `IW${cfg.iw2}`;
    if (resolved.panel.analogOutputs[0]) resolved.panel.analogOutputs[0].addr = `QW${cfg.qw1}`;
    if (resolved.panel.analogOutputs[1]) resolved.panel.analogOutputs[1].addr = `QW${cfg.qw2}`;

    // Resolve conveyor sensors
    resolved.conveyor.sensors.forEach(s => {
        const bit = parseInt(s._bit);
        s.addr = `I${cfg.convI}.${bit}`;
    });

    // Resolve conveyor station inputs
    resolved.conveyor.stationInputs.forEach(si => {
        const bit = parseInt(si._bit);
        si.addr = `I${cfg.convI}.${bit}`;
    });

    // Resolve conveyor station outputs
    resolved.conveyor.stationOutputs.forEach(so => {
        const bit = parseInt(so._bit);
        so.addr = `Q${cfg.convQ}.${bit}`;
    });

    // Resolve motor outputs
    resolved.conveyor.motorOutputs.forEach(mo => {
        const bit = parseInt(mo._bit);
        mo.addr = `Q${cfg.convQ}.${bit}`;
    });

    return resolved;
}

// ============================================
// EXERCISE DEFINITIONS (using _bit for conveyor address resolution)
// ============================================

const EXERCISE_DEFS = {
    "TIA-PRO1": {
        name: "TIA-PRO1 - Programmation de base",
        description: "Marche/Arret, defauts, modes manuel/auto",
        panel: {
            inputs: [
                { _bit: 0, name: "BP_Arret", label: "Arret", type: "toggle" },
                { _bit: 1, name: "BP_Marche", label: "Marche", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "BP_defaut1", label: "Defaut 1", type: "toggle" },
                { _bit: 5, name: "BP_defaut2", label: "Defaut 2", type: "toggle" },
                { _bit: 6, name: "BP_defaut3", label: "Defaut 3", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "", label: "Voyant 0", color: "green" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "Defaut_1", label: "Defaut 1", color: "red" },
                { _bit: 3, name: "Defaut_2", label: "Defaut 2", color: "red" },
                { _bit: 4, name: "Defaut_3", label: "Defaut 3", color: "red" },
                { _bit: 5, name: "Demarrage_manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 6, name: "Demarrage_automatique", label: "Mode Auto", color: "blue" },
                { _bit: 7, name: "Defaut_tapis", label: "Defaut Tapis", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-PRO2": {
        name: "TIA-PRO2 - Programmation avancee",
        description: "Hors service/En service, poids, modes",
        panel: {
            inputs: [
                { _bit: 0, name: "BP_Hors_Service", label: "Hors Service", type: "toggle" },
                { _bit: 1, name: "BP_En_Service", label: "En Service", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "Q_Defaut_Poids", label: "Def. Poids", color: "red" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "", label: "Voyant 3", color: "green" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "Demarrage_manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 6, name: "Demarrage_automatique", label: "Mode Auto", color: "blue" },
                { _bit: 7, name: "Defaut_tapis", label: "Defaut Tapis", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur_ana1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-GRAPH": {
        name: "TIA-GRAPH - GRAFCET / SFC",
        description: "Programmation sequentielle GRAPH",
        panel: {
            inputs: [
                { _bit: 0, name: "S_InitializeSequence", label: "Init Sequence", type: "momentary" },
                { _bit: 1, name: "S_Mode", label: "Mode", type: "toggle" },
                { _bit: 2, name: "S_JogRight", label: "Jog Droite", type: "momentary" },
                { _bit: 3, name: "S_JogLeft", label: "Jog Gauche", type: "momentary" },
                { _bit: 4, name: "S_StepPrev", label: "Etape Prec.", type: "momentary" },
                { _bit: 5, name: "S_StepNext", label: "Etape Suiv.", type: "momentary" },
                { _bit: 6, name: "S_StepOn", label: "Valid. Etape", type: "momentary" },
                { _bit: 7, name: "S_AckFault", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "", label: "Voyant 0", color: "green" },
                { _bit: 1, name: "", label: "Voyant 1", color: "green" },
                { _bit: 2, name: "P_Manual", label: "Manuel", color: "yellow" },
                { _bit: 3, name: "P_Auto", label: "Auto", color: "blue" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "", label: "Voyant 5", color: "green" },
                { _bit: 6, name: "", label: "Voyant 6", color: "green" },
                { _bit: 7, name: "P_Fault", label: "Defaut", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-SERV1": {
        name: "TIA-SERV1 - Mise en service 1",
        description: "Mise en service, modes, diagnostic",
        panel: {
            inputs: [
                { _bit: 0, name: "BP_Arret", label: "Arret (NF)", type: "toggle" },
                { _bit: 1, name: "BP_Marche", label: "Marche", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "Select_Mode", label: "Sel. Mode", type: "toggle" },
                { _bit: 5, name: "Valid_Mode", label: "Valid. Mode", type: "momentary" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "", label: "Voyant 0", color: "green" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "Q_Manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 3, name: "Q_Automatique", label: "Mode Auto", color: "blue" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "", label: "Voyant 5", color: "green" },
                { _bit: 6, name: "", label: "Voyant 6", color: "green" },
                { _bit: 7, name: "Defaut_tapis", label: "Defaut Tapis", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-SERV2": {
        name: "TIA-SERV2 - Mise en service 2",
        description: "Defauts, diagnostic avance",
        panel: {
            inputs: [
                { _bit: 0, name: "", label: "Interrupteur 0", type: "toggle" },
                { _bit: 1, name: "", label: "Interrupteur 1", type: "toggle" },
                { _bit: 2, name: "", label: "Interrupteur 2", type: "toggle" },
                { _bit: 3, name: "", label: "Interrupteur 3", type: "toggle" },
                { _bit: 4, name: "BP_defaut1", label: "Defaut 1", type: "toggle" },
                { _bit: 5, name: "BP_defaut2", label: "Defaut 2", type: "toggle" },
                { _bit: 6, name: "BP_defaut3", label: "Defaut 3", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "Defaut_poids", label: "Def. Poids", color: "red" },
                { _bit: 1, name: "Disponible", label: "Disponible", color: "green" },
                { _bit: 2, name: "Mode_manuel", label: "Manuel", color: "yellow" },
                { _bit: 3, name: "Mode_automatique", label: "Auto", color: "blue" },
                { _bit: 4, name: "Defaut_1", label: "Defaut 1", color: "red" },
                { _bit: 5, name: "Defaut_2", label: "Defaut 2", color: "red" },
                { _bit: 6, name: "Defaut_3", label: "Defaut 3", color: "red" },
                { _bit: 7, name: "Defaut", label: "Defaut", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-SYSUP": {
        name: "TIA-SYSUP - Systeme avance",
        description: "Fonctions systeme avancees",
        panel: {
            inputs: [
                { _bit: 0, name: "", label: "Interrupteur 0", type: "toggle" },
                { _bit: 1, name: "BP_En_Service", label: "En Service", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "Defaut_Poids", label: "Def. Poids", color: "red" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "", label: "Voyant 3", color: "green" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "Demarrage_manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 6, name: "Demarrage_automatique", label: "Mode Auto", color: "blue" },
                { _bit: 7, name: "Defaut", label: "Defaut", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "CPT-FAP": {
        name: "CPT-FAP - Comptage",
        description: "Comptage standard",
        panel: {
            inputs: [
                { _bit: 0, name: "", label: "Interrupteur 0", type: "toggle" },
                { _bit: 1, name: "", label: "Interrupteur 1", type: "toggle" },
                { _bit: 2, name: "", label: "Interrupteur 2", type: "toggle" },
                { _bit: 3, name: "", label: "Interrupteur 3", type: "toggle" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "S_AcqDefaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "", label: "Voyant 0", color: "green" },
                { _bit: 1, name: "P_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "P_max", label: "Max", color: "red" },
                { _bit: 4, name: "P_norm", label: "Normal", color: "green" },
                { _bit: 5, name: "P_min", label: "Min", color: "yellow" },
                { _bit: 6, name: "", label: "Voyant 6", color: "green" },
                { _bit: 7, name: "P_Defaut", label: "Defaut", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_Afficheur2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "CTP-FAST1": {
        name: "CTP-FAST1 - Comptage rapide",
        description: "Comptage rapide",
        panel: {
            inputs: [
                { _bit: 0, name: "", label: "Interrupteur 0", type: "toggle" },
                { _bit: 1, name: "", label: "Interrupteur 1", type: "toggle" },
                { _bit: 2, name: "", label: "Interrupteur 2", type: "toggle" },
                { _bit: 3, name: "", label: "Interrupteur 3", type: "toggle" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "", label: "Interrupteur 7", type: "toggle" }
            ],
            outputs: [
                { _bit: 0, name: "", label: "Voyant 0", color: "green" },
                { _bit: 1, name: "", label: "Voyant 1", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "", label: "Voyant 3", color: "green" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "", label: "Voyant 5", color: "green" },
                { _bit: 6, name: "", label: "Voyant 6", color: "green" },
                { _bit: 7, name: "", label: "Voyant 7", color: "green" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_Afficheur2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-PRI1": {
        name: "TIA-PRI1 - Prog. Industrielle 1",
        description: "Programmation industrielle 1",
        panel: {
            inputs: [
                { _bit: 0, name: "BP_Arret", label: "Arret", type: "toggle" },
                { _bit: 1, name: "BP_Marche", label: "Marche", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "Q_Defaut_Poids", label: "Def. Poids", color: "red" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "", label: "Voyant 3", color: "green" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "Demarrage_manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 6, name: "Demarrage_automatique", label: "Mode Auto", color: "blue" },
                { _bit: 7, name: "Q_Defaut", label: "Defaut", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-PJ2": {
        name: "TIA-PJ2 - Prog. Industrielle 2",
        description: "Programmation industrielle 2",
        panel: {
            inputs: [
                { _bit: 0, name: "BP_Hors_Service", label: "Hors Service", type: "toggle" },
                { _bit: 1, name: "BP_En_Service", label: "En Service", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "Q_Defaut_Poids", label: "Def. Poids", color: "red" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "", label: "Voyant 3", color: "green" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "Demarrage_manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 6, name: "Demarrage_automatique", label: "Mode Auto", color: "blue" },
                { _bit: 7, name: "Q_Defaut", label: "Defaut", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-SPEC1": {
        name: "TIA-SPEC1 - Specialisation 1",
        description: "Specialisation 1",
        panel: {
            inputs: [
                { _bit: 0, name: "BP_Arret", label: "Arret", type: "toggle" },
                { _bit: 1, name: "BP_Marche", label: "Marche", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "", label: "Voyant 0", color: "green" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "", label: "Voyant 3", color: "green" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "Demarrage_manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 6, name: "Demarrage_automatique", label: "Mode Auto", color: "blue" },
                { _bit: 7, name: "Defaut_tapis", label: "Defaut Tapis", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    },

    "TIA-SPEC2": {
        name: "TIA-SPEC2 - Specialisation 2",
        description: "Specialisation 2",
        panel: {
            inputs: [
                { _bit: 0, name: "BP_Arret", label: "Arret", type: "toggle" },
                { _bit: 1, name: "BP_Marche", label: "Marche", type: "toggle" },
                { _bit: 2, name: "BP_Droite", label: "Droite", type: "momentary" },
                { _bit: 3, name: "BP_Gauche", label: "Gauche", type: "momentary" },
                { _bit: 4, name: "", label: "Interrupteur 4", type: "toggle" },
                { _bit: 5, name: "", label: "Interrupteur 5", type: "toggle" },
                { _bit: 6, name: "", label: "Interrupteur 6", type: "toggle" },
                { _bit: 7, name: "BP_Acquittement_defaut", label: "Acquit. Defaut", type: "momentary" }
            ],
            outputs: [
                { _bit: 0, name: "", label: "Voyant 0", color: "green" },
                { _bit: 1, name: "Q_En_Service", label: "En Service", color: "green" },
                { _bit: 2, name: "", label: "Voyant 2", color: "green" },
                { _bit: 3, name: "", label: "Voyant 3", color: "green" },
                { _bit: 4, name: "", label: "Voyant 4", color: "green" },
                { _bit: 5, name: "Demarrage_manuel", label: "Mode Manuel", color: "yellow" },
                { _bit: 6, name: "Demarrage_automatique", label: "Mode Auto", color: "blue" },
                { _bit: 7, name: "Defaut_tapis", label: "Defaut Tapis", color: "red" }
            ],
            topLights: [
                { _bit: 0, name: "TopLight1_Rouge", color: "red" },
                { _bit: 1, name: "TopLight1_Verte", color: "green" },
                { _bit: 2, name: "TopLight2_Rouge", color: "red" },
                { _bit: 3, name: "TopLight2_Verte", color: "green" }
            ],
            analogInputs: [
                { name: "Curseur_1", label: "IW10", min: 0, max: 27648 },
                { name: "Curseur2_consigne", label: "IW30", min: 0, max: 27648 }
            ],
            analogOutputs: [
                { name: "Q_Afficheur1", label: "QW32", min: 0, max: 27648 },
                { name: "Q_TensionAff2", label: "QW34", min: 0, max: 27648 }
            ]
        },
        conveyor: {
            sensors: [
                { _bit: 5, name: "B_Ini1", position: 1 },
                { _bit: 6, name: "B_Ini2", position: 2 },
                { _bit: 7, name: "B_Ini3", position: 3 },
                { _bit: 0, name: "B_LS", position: 5 }
            ],
            stationInputs: [
                { _bit: 1, name: "BP_Poste1", position: 1 },
                { _bit: 2, name: "BP_Poste2", position: 2 },
                { _bit: 3, name: "BP_Poste3", position: 3 },
                { _bit: 4, name: "BP_PosteBL", position: 4 }
            ],
            stationOutputs: [
                { _bit: 1, name: "Q_Poste1", position: 1 },
                { _bit: 2, name: "Q_Poste2", position: 2 },
                { _bit: 3, name: "Q_Poste3", position: 3 },
                { _bit: 4, name: "Q_PosteLS", position: 4 }
            ],
            motorOutputs: [
                { _bit: 5, name: "K_Droite", label: "Moteur Droite" },
                { _bit: 6, name: "K_Gauche", label: "Moteur Gauche" },
                { _bit: 7, name: "Q_klaxon", label: "Klaxon" }
            ]
        }
    }
};
