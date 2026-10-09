/**
 * SITRAIN Simulator Web — Main Application
 *
 * Designed to be controlled by PLCSim via WebSocket bridge.
 * Outputs (Q) come FROM the PLC, Inputs (I) are sent TO the PLC.
 */

const sim = new PLCSimulator();
let currentExercise = 'TIA-PRO1';
let currentPlcModel = 'S7-1500';
let panelVisible = false;
let displayMode = 'absolu'; // 'absolu', 'symbolique', 'both'

let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;
let resolvedEx = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadExercise(currentExercise, currentPlcModel);
    setupToolbar();
    setupControlPanel();
    setupConveyor();
    setupDialogs();
    setupKeyboard();
    setupPlcModelSwitch();
    setupDisplayMode();
    initBeltStripes();

    // Auto-connect in simulation mode
    sim.connect('simulation');
    updateStatusUI(true, 'simulation');

    // Callbacks
    sim.onCycleUpdate = updateAllVisuals;
    sim.onPiecesChanged = renderPieces;
});

// ============================================
// PLC MODEL SWITCHING
// ============================================

function setupPlcModelSwitch() {
    document.querySelectorAll('input[name="plc-model"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentPlcModel = e.target.value;
            loadExercise(currentExercise, currentPlcModel);
        });
    });
}

// ============================================
// DISPLAY MODE
// ============================================

function setupDisplayMode() {
    document.querySelectorAll('input[name="display-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            displayMode = e.target.value;
            applyDisplayMode();
        });
    });
}

function applyDisplayMode() {
    if (!resolvedEx) return;
    updateConveyorLabels(resolvedEx, currentPlcModel);
    renderSwitches(resolvedEx);
    renderLEDs(resolvedEx);
}

/** Format label based on display mode */
function formatLabel(addr, name) {
    const sym = name || addr;
    switch (displayMode) {
        case 'absolu': return addr;
        case 'symbolique': return sym;
        case 'both': return addr; // handled specially in rendering
        default: return addr;
    }
}

/** Format for SVG text (single line) */
function formatSvgLabel(addr, name) {
    switch (displayMode) {
        case 'absolu': return addr;
        case 'symbolique': return name || addr;
        case 'both': return addr; // first line only, second line added separately
        default: return addr;
    }
}

// ============================================
// BELT STRIPES
// ============================================

function initBeltStripes() {
    const g = document.getElementById('belt-stripes-group');
    if (!g) return;
    g.innerHTML = '';
    for (let x = 25; x < 725; x += 15) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', 136);
        line.setAttribute('x2', x);
        line.setAttribute('y2', 204);
        line.setAttribute('stroke', '#444');
        line.setAttribute('stroke-width', '1');
        g.appendChild(line);
    }
}

// ============================================
// TOOLBAR
// ============================================

function setupToolbar() {
    document.getElementById('btn-tab-connexion').addEventListener('click', () => {
        document.getElementById('dialog-connexion').style.display = 'flex';
    });
    document.getElementById('btn-tab-panneau').addEventListener('click', toggleControlPanel);
    document.getElementById('btn-tab-affichage').addEventListener('click', () => {
        document.getElementById('dialog-affichage').style.display = 'flex';
    });
    document.getElementById('btn-tab-aide').addEventListener('click', () => {
        document.getElementById('dialog-aide').style.display = 'flex';
    });
    document.getElementById('plc-type-select').addEventListener('change', (e) => {
        currentExercise = e.target.value;
        loadExercise(currentExercise, currentPlcModel);
    });
}

// ============================================
// EXERCISE LOADING
// ============================================

function loadExercise(exerciseId, plcModel) {
    const exDef = EXERCISE_DEFS[exerciseId];
    if (!exDef) return;

    resolvedEx = resolveExercise(exDef, plcModel);
    sim.initExercise(resolvedEx);

    // I0.0 is NF (normally closed) → TRUE at rest
    const i00Addr = resolvedEx.panel.inputs[0].addr;
    sim.setInput(i00Addr, true);

    // Optical barrier I3.0 is normally TRUE (beam intact)
    const cfg = PLC_CONFIG[plcModel];
    const optAddr = `I${cfg.convI}.0`;
    if (sim.variables[optAddr]) sim.setInput(optAddr, true);

    renderSwitches(resolvedEx);
    renderLEDs(resolvedEx);
    updateConveyorLabels(resolvedEx, plcModel);
    renderPieces();

    if (sim.connected) sim.startCycle();

    // Re-subscribe WebSocket with new addresses after model/exercise change
    sim.resubscribe();
}

// ============================================
// CONVEYOR LABELS (dynamic addresses + display mode)
// ============================================

function updateConveyorLabels(ex, plcModel) {
    const cfg = PLC_CONFIG[plcModel];

    // Sensor labels at top of SVG
    document.querySelectorAll('#conveyor-svg .sensor-label').forEach(textEl => {
        const bit = parseInt(textEl.dataset.bit);
        const sensor = ex.conveyor.sensors.find(s => s._bit === bit);
        const addr = `I${cfg.convI}.${bit}`;
        const name = sensor ? sensor.name : '';

        textEl.textContent = formatSvgLabel(addr, name);

        // For 'both' mode, add/update a second line below
        const parentG = textEl.parentElement;
        let sub = parentG.querySelector('.sensor-label-sub');
        if (displayMode === 'both' && name) {
            if (!sub) {
                sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                sub.setAttribute('class', 'sensor-label-sub');
                sub.setAttribute('text-anchor', 'middle');
                sub.setAttribute('fill', '#ada');
                sub.setAttribute('font-size', '9');
                parentG.appendChild(sub);
            }
            sub.setAttribute('x', textEl.getAttribute('x'));
            const baseY = parseFloat(textEl.getAttribute('y'));
            sub.setAttribute('y', baseY + 11);
            sub.textContent = name;
        } else if (sub) {
            sub.remove();
        }
    });

    // Bottom station labels
    const stationData = [
        { qId: 'led-q31', iId: 'led-i31', qBit: 1, iBit: 1 },
        { qId: 'led-q32', iId: 'led-i32', qBit: 2, iBit: 2 },
        { qId: 'led-q33', iId: 'led-i33', qBit: 3, iBit: 3 },
        { qId: 'led-q34', iId: 'led-i34', qBit: 4, iBit: 4 },
    ];

    stationData.forEach(pair => {
        const qCircle = document.getElementById(pair.qId);
        if (!qCircle) return;
        const parentG = qCircle.parentElement;
        const texts = parentG.querySelectorAll('text');

        const qAddr = `Q${cfg.convQ}.${pair.qBit}`;
        const iAddr = `I${cfg.convI}.${pair.iBit}`;
        const qOut = ex.conveyor.stationOutputs.find(s => s._bit === pair.qBit);
        const iInp = ex.conveyor.stationInputs.find(s => s._bit === pair.iBit);

        if (texts[0]) texts[0].textContent = formatSvgLabel(qAddr, qOut ? qOut.name : '');
        if (texts[1]) texts[1].textContent = formatSvgLabel(iAddr, iInp ? iInp.name : '');
    });
}

// ============================================
// CONTROL PANEL
// ============================================

function setupControlPanel() {
    const cpw = document.getElementById('control-panel-window');
    const titlebar = document.getElementById('cpw-titlebar');

    titlebar.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = cpw.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        cpw.style.left = (e.clientX - dragOffsetX) + 'px';
        cpw.style.top = (e.clientY - dragOffsetY) + 'px';
        cpw.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    document.getElementById('cpw-close').addEventListener('click', () => {
        cpw.style.display = 'none';
        panelVisible = false;
        document.getElementById('btn-tab-panneau').classList.remove('active');
    });
    document.getElementById('cpw-minimize').addEventListener('click', () => {
        const body = document.getElementById('cpw-body');
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('slider-iw10').addEventListener('input', (e) => {
        const addr = resolvedEx ? resolvedEx.panel.analogInputs[0].addr : 'IW10';
        sim.setInput(addr, parseInt(e.target.value));
    });
    document.getElementById('slider-iw30').addEventListener('input', (e) => {
        const addr = resolvedEx ? resolvedEx.panel.analogInputs[1].addr : 'IW30';
        sim.setInput(addr, parseInt(e.target.value));
    });
}

function toggleControlPanel() {
    const cpw = document.getElementById('control-panel-window');
    panelVisible = !panelVisible;
    cpw.style.display = panelVisible ? 'block' : 'none';
    document.getElementById('btn-tab-panneau').classList.toggle('active', panelVisible);
}

function renderSwitches(exercise) {
    const container = document.getElementById('switches-list');
    container.innerHTML = '';

    exercise.panel.inputs.forEach((input, idx) => {
        // Masquer les entrees sans nom de variable
        if (!input.name) return;

        const row = document.createElement('div');
        row.className = 'switch-row';

        const label = document.createElement('span');
        label.className = 'switch-label';
        if (displayMode === 'both') {
            label.innerHTML = `<span>${input.addr}</span><br><span class="switch-sub">${input.name}</span>`;
        } else {
            label.textContent = formatLabel(input.addr, input.name);
        }

        const toggle = document.createElement('div');
        toggle.className = 'toggle-switch';
        toggle.dataset.addr = input.addr;
        toggle.title = `${input.name} — ${input.label}`;

        // L'app web remplace la maquette physique :
        // les boutons écrivent dans les I de PLCSim via le serveur
        const isNF = (idx === 0);

        if (input.type === 'toggle') {
            if (isNF) toggle.classList.add('on');
            toggle.addEventListener('click', () => {
                const current = sim.getValue(input.addr);
                sim.setInput(input.addr, !current);
                toggle.classList.toggle('on', !current);
            });
        } else {
            // Bouton poussoir momentané
            toggle.addEventListener('mousedown', () => {
                sim.setInput(input.addr, true);
                toggle.classList.add('on');
            });
            toggle.addEventListener('mouseup', () => {
                sim.setInput(input.addr, false);
                toggle.classList.remove('on');
            });
            toggle.addEventListener('mouseleave', () => {
                sim.setInput(input.addr, false);
                toggle.classList.remove('on');
            });
        }

        row.appendChild(label);
        row.appendChild(toggle);
        container.appendChild(row);
    });
}

function renderLEDs(exercise) {
    const container = document.getElementById('leds-list');
    container.innerHTML = '';

    exercise.panel.outputs.forEach(output => {
        // Masquer les sorties sans nom de variable
        if (!output.name) return;

        const row = document.createElement('div');
        row.className = 'led-row';

        const label = document.createElement('span');
        label.className = 'led-label';
        if (displayMode === 'both') {
            label.innerHTML = `<span>${output.addr}</span><br><span class="led-sub">${output.name}</span>`;
        } else {
            label.textContent = formatLabel(output.addr, output.name);
        }

        const led = document.createElement('div');
        led.className = 'led-indicator';
        led.dataset.addr = output.addr;
        led.dataset.color = output.color || 'green';
        led.title = `${output.name} — ${output.label}`;

        row.appendChild(led);
        row.appendChild(label);
        container.appendChild(row);
    });
}

// ============================================
// CONVEYOR
// ============================================

function setupConveyor() {
    // Delegation d'evenement pour supprimer une piece en cliquant dessus
    const piecesContainer = document.getElementById('pieces-container');
    if (piecesContainer) {
        piecesContainer.addEventListener('mousedown', (e) => {
            const pieceGroup = e.target.closest('g[data-piece-id]');
            if (pieceGroup) {
                e.stopPropagation();
                e.preventDefault();
                const pieceId = parseFloat(pieceGroup.dataset.pieceId);
                sim.removePiece(pieceId);
                renderPieces();
                updateConveyorVisuals();
            }
        });
    }

    // "Placer une piece" buttons — only for ILS stations 1-3
    for (let i = 1; i <= 3; i++) {
        const btn = document.getElementById(`place-btn-${i}`);
        if (btn) {
            btn.addEventListener('click', () => {
                const existing = sim.pieces.find(p =>
                    Math.abs(p.x - sim.SENSOR_POSITIONS[`ils${i}`]) < sim.SENSOR_RANGE
                );
                if (existing) {
                    sim.removePiece(existing.id);
                } else {
                    sim.placePiece(i);
                }
                // Rafraichir immediatement les visuels (capteurs + pieces)
                renderPieces();
                updateConveyorVisuals();
            });
        }
    }

    // Placer une piece devant le capteur optique (I3.0)
    const btnOpt = document.getElementById('place-btn-opt');
    if (btnOpt) {
        btnOpt.addEventListener('click', () => {
            const optX = sim.SENSOR_POSITIONS.opt;
            const existing = sim.pieces.find(p => Math.abs(p.x - optX) < sim.SENSOR_RANGE);
            if (existing) {
                sim.removePiece(existing.id);
            } else {
                // Place piece at optical sensor position
                const id = Date.now() + Math.random();
                sim.pieces.push({ id, x: optX, station: 'opt' });
                sim.updateSensorsFromPieces();
                if (sim.onPiecesChanged) sim.onPiecesChanged();
            }
            renderPieces();
            updateConveyorVisuals();
        });
    }

    // BP_Poste push buttons (I3.1 - I3.4) — momentary: active while pressed
    setupBPPosteButtons();
}

/**
 * Wire up BP_Poste1-4 circles as momentary push buttons.
 * Mousedown = TRUE, Mouseup/Mouseleave = FALSE.
 */
function setupBPPosteButtons() {
    document.querySelectorAll('.bp-poste-btn').forEach(circle => {
        const bit = parseInt(circle.dataset.bit);

        const press = (e) => {
            e.preventDefault();
            if (!resolvedEx) return;
            const cfg = PLC_CONFIG[currentPlcModel];
            const addr = `I${cfg.convI}.${bit}`;
            sim.setInput(addr, true);
            circle.setAttribute('stroke', '#ff0');
            circle.setAttribute('stroke-width', '3');
        };

        const release = () => {
            if (!resolvedEx) return;
            const cfg = PLC_CONFIG[currentPlcModel];
            const addr = `I${cfg.convI}.${bit}`;
            sim.setInput(addr, false);
            circle.setAttribute('stroke', '#777');
            circle.setAttribute('stroke-width', '2');
        };

        circle.addEventListener('mousedown', press);
        circle.addEventListener('mouseup', release);
        circle.addEventListener('mouseleave', release);
        // Touch support
        circle.addEventListener('touchstart', press);
        circle.addEventListener('touchend', release);
    });
}


/**
 * Render pieces as aluminum discs at their current x position
 * on the center of the belt.
 */
function renderPieces() {
    const container = document.getElementById('pieces-container');
    container.innerHTML = '';

    const cy = sim.BELT_CENTER_Y;
    const r = 16;

    sim.pieces.forEach(piece => {
        const cx = piece.x;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = 'pointer';
        g.setAttribute('data-piece-id', piece.id);

        // Zone de clic invisible plus grande
        const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hitArea.setAttribute('cx', cx);
        hitArea.setAttribute('cy', cy);
        hitArea.setAttribute('r', r + 10);
        hitArea.setAttribute('fill', 'transparent');

        // Aluminum disc
        const disc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        disc.setAttribute('cx', cx);
        disc.setAttribute('cy', cy);
        disc.setAttribute('r', r);
        disc.setAttribute('fill', '#c0c0c0');
        disc.setAttribute('stroke', '#888');
        disc.setAttribute('stroke-width', '1.5');
        disc.setAttribute('pointer-events', 'none');

        // Inner bevel ring
        const bevel = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bevel.setAttribute('cx', cx);
        bevel.setAttribute('cy', cy);
        bevel.setAttribute('r', r * 0.7);
        bevel.setAttribute('fill', 'none');
        bevel.setAttribute('stroke', '#aaa');
        bevel.setAttribute('stroke-width', '0.5');
        bevel.setAttribute('pointer-events', 'none');

        // Metallic highlight
        const shine = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        shine.setAttribute('cx', cx - r * 0.2);
        shine.setAttribute('cy', cy - r * 0.25);
        shine.setAttribute('rx', r * 0.4);
        shine.setAttribute('ry', r * 0.25);
        shine.setAttribute('fill', 'rgba(255,255,255,0.4)');
        shine.setAttribute('pointer-events', 'none');

        g.appendChild(hitArea);
        g.appendChild(disc);
        g.appendChild(bevel);
        g.appendChild(shine);
        container.appendChild(g);
    });
}

// ============================================
// DIALOGS
// ============================================

function setupDialogs() {
    document.getElementById('conn-mode').addEventListener('change', (e) => {
        const m = e.target.value;
        document.getElementById('conn-plc-options').style.display = (m === 'plcsim' || m === 's7') ? 'block' : 'none';
        document.getElementById('conn-s7-options').style.display = (m === 's7') ? 'block' : 'none';
    });
    document.getElementById('conn-btn-connect').addEventListener('click', doConnect);
    document.getElementById('conn-btn-cancel').addEventListener('click', () => {
        document.getElementById('dialog-connexion').style.display = 'none';
    });
    document.getElementById('aide-btn-close').addEventListener('click', () => {
        document.getElementById('dialog-aide').style.display = 'none';
    });
    document.getElementById('affichage-btn-close').addEventListener('click', () => {
        document.getElementById('dialog-affichage').style.display = 'none';
    });
    document.querySelectorAll('.dialog-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) overlay.style.display = 'none';
        });
    });
}

// ============================================
// CONNECTION
// ============================================

function doConnect() {
    const mode = document.getElementById('conn-mode').value;

    if (mode === 'simulation') {
        sim.disconnect();
        sim.connect('simulation');
        updateStatusUI(true, 'simulation');
    } else {
        let wsPort = parseInt(document.getElementById('conn-ws-port').value) || 8765;
        if (wsPort < 1024) {
            // Confusion frequente avec le port S7 (102) : le serveur local ecoute toujours sur 8765
            console.warn('[UI] Port WebSocket invalide (' + wsPort + '), retour a 8765');
            wsPort = 8765;
            document.getElementById('conn-ws-port').value = 8765;
        }
        const options = { wsHost: 'localhost', wsPort: wsPort };

        if (mode === 's7') {
            // Automate reel ou NetToPLCSim : le serveur ouvre une liaison S7 vers cette IP
            options.plcIp = (document.getElementById('conn-plc-ip').value || '').trim();
            options.rack = parseInt(document.getElementById('conn-rack').value) || 0;
            options.slot = parseInt(document.getElementById('conn-slot').value) || 1;
            document.getElementById('plc-ip-display').value = options.plcIp;
        }
        // Mode 'plcsim' : pas d'IP, le serveur utilise l'instance PLCSim Advanced

        sim.onStatusChange = (data) => {
            if (data.plc_connected) updateStatusUI(true, 'plc', data.plc_ip);
            else updateStatusUI(true, 'ws-only', data.message);
        };

        sim.disconnect();
        sim.connect('plcsim', options);
        updateStatusUI(true, 'connecting');
    }
    document.getElementById('dialog-connexion').style.display = 'none';
}

function updateStatusUI(connected, mode, detail) {
    const indicator = document.getElementById('status-indicator');
    const label = document.getElementById('status-label');
    const detailEl = document.getElementById('status-detail');
    const statusBar = document.getElementById('toolbar-status');

    // Reset classes
    indicator.className = 'status-indicator';
    statusBar.className = 'toolbar-status';

    if (!connected) {
        statusBar.classList.add('status-disconnected');
        label.textContent = 'Deconnecte';
        detailEl.textContent = 'Aucune connexion';
        indicator.style.background = '#c00';
        indicator.style.borderColor = '#900';
        return;
    }

    switch (mode) {
        case 'simulation':
            statusBar.classList.add('status-simulation');
            indicator.classList.add('connected');
            label.textContent = 'Simulation locale';
            detailEl.textContent = 'Sans PLC — mode test';
            break;

        case 'plc':
            statusBar.classList.add('status-plc-connected');
            indicator.classList.add('connected');
            label.textContent = 'PLC Connecte';
            detailEl.textContent = detail || 'Automate connecte';
            break;

        case 'connecting':
            statusBar.classList.add('status-connecting');
            indicator.classList.add('connecting');
            label.textContent = 'Connexion en cours...';
            detailEl.textContent = 'Attente du serveur WebSocket';
            break;

        case 'ws-only':
            statusBar.classList.add('status-ws-only');
            indicator.classList.add('ws-only');
            label.textContent = 'Serveur OK — PLC absent';
            detailEl.textContent = detail || 'Le serveur repond mais aucun automate connecte';
            break;

        default:
            statusBar.classList.add('status-simulation');
            indicator.classList.add('connected');
            label.textContent = `Connecte (${sim.mode})`;
            detailEl.textContent = '';
    }
}

// ============================================
// VISUAL UPDATES (called every 100ms cycle)
// ============================================

function updateAllVisuals() {
    if (!resolvedEx) return;

    updateSwitchVisuals();
    updateLEDVisuals();
    updateTopLightVisuals();
    updateAnalogDisplays();
    updateConveyorVisuals();
    renderPieces(); // re-render pieces at their current x positions
}

function updateSwitchVisuals() {
    document.querySelectorAll('.toggle-switch[data-addr]').forEach(toggle => {
        const val = sim.getValue(toggle.dataset.addr);
        toggle.classList.toggle('on', !!val);
    });
}

function updateLEDVisuals() {
    const colors = {
        red: { bg: '#e00', border: '#c00' },
        yellow: { bg: '#cc0', border: '#aa0' },
        blue: { bg: '#44f', border: '#22c' },
        green: { bg: '#0c0', border: '#090' }
    };

    document.querySelectorAll('.led-indicator[data-addr]').forEach(led => {
        const val = sim.getValue(led.dataset.addr);
        const c = colors[led.dataset.color] || colors.green;
        if (val) {
            led.style.background = c.bg;
            led.style.borderColor = c.border;
            led.style.boxShadow = `0 0 10px ${c.bg}`;
        } else {
            led.style.background = '#ccc';
            led.style.borderColor = '#999';
            led.style.boxShadow = 'none';
        }
    });
}

function updateTopLightVisuals() {
    const mapping = { 'tl-q20': 0, 'tl-q21': 1, 'tl-q22': 2, 'tl-q23': 3 };
    for (const [id, idx] of Object.entries(mapping)) {
        const el = document.getElementById(id);
        const tl = resolvedEx.panel.topLights[idx];
        if (!el || !tl) continue;
        el.className = 'toplight-led' + (sim.getValue(tl.addr) ? ` on-${tl.color}` : '');
    }
}

function updateAnalogDisplays() {
    const ao1 = resolvedEx.panel.analogOutputs[0];
    const ao2 = resolvedEx.panel.analogOutputs[1];
    const d1 = document.getElementById('disp-qw32');
    const d2 = document.getElementById('disp-qw34');
    if (d1 && ao1) d1.value = (sim.getValue(ao1.addr) || 0);
    if (d2 && ao2) d2.value = (sim.getValue(ao2.addr) || 0);
}

function updateConveyorVisuals() {
    const cfg = PLC_CONFIG[currentPlcModel];

    // Station output LEDs (Q_.1 - Q_.4)
    const outIds = ['led-q31', 'led-q32', 'led-q33', 'led-q34'];
    resolvedEx.conveyor.stationOutputs.forEach((so, i) => {
        const el = document.getElementById(outIds[i]);
        if (!el) return;
        const val = sim.getValue(so.addr);
        el.setAttribute('fill', val ? '#0f0' : '#555');
        if (val) el.setAttribute('filter', 'url(#glow)'); else el.removeAttribute('filter');
    });

    // Station input LEDs (I_.1 - I_.4)
    const inIds = ['led-i31', 'led-i32', 'led-i33', 'led-i34'];
    resolvedEx.conveyor.stationInputs.forEach((si, i) => {
        const el = document.getElementById(inIds[i]);
        if (!el) return;
        el.setAttribute('fill', sim.getValue(si.addr) ? '#cc0' : '#665500');
    });

    // ILS sensor LEDs
    [{ id: 'sensor-i35-led', bit: 5 }, { id: 'sensor-i36-led', bit: 6 }, { id: 'sensor-i37-led', bit: 7 }].forEach(sm => {
        const el = document.getElementById(sm.id);
        if (!el) return;
        const sensor = resolvedEx.conveyor.sensors.find(s => s._bit === sm.bit);
        if (!sensor) return;
        const val = sim.getValue(sensor.addr);
        el.setAttribute('fill', val ? '#0f0' : '#444');
        if (val) el.setAttribute('filter', 'url(#glow)'); else el.removeAttribute('filter');
    });

    // Optical sensor I3.0
    const optSensor = resolvedEx.conveyor.sensors.find(s => s._bit === 0);
    if (optSensor) {
        const optVal = sim.getValue(optSensor.addr);
        const beam = document.getElementById('sensor-i30-beam');
        const emitter = document.getElementById('sensor-i30-emitter');
        const led = document.getElementById('sensor-i30-led');

        if (beam) {
            beam.setAttribute('opacity', optVal ? '0.7' : '0.1');
            beam.setAttribute('stroke', optVal ? '#ff3333' : '#440000');
        }
        if (emitter) emitter.setAttribute('fill', optVal ? '#f00' : '#600');
        if (led) {
            led.setAttribute('fill', optVal ? '#f00' : '#444');
            if (optVal) led.setAttribute('filter', 'url(#glow)'); else led.removeAttribute('filter');
        }
    }

    // Belt animation
    const beltGroup = document.getElementById('belt-stripes-group');
    if (beltGroup) {
        const kDroite = sim.getByName('K_Droite');
        const kGauche = sim.getByName('K_Gauche');
        beltGroup.style.animation = kDroite ? 'beltMoveRight 0.5s linear infinite'
            : kGauche ? 'beltMoveLeft 0.5s linear infinite' : 'none';
    }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        switch (e.key) {
            case ' ': e.preventDefault(); sim.placePiece(1); renderPieces(); updateConveyorVisuals(); break;
            case 'p': case 'P': toggleControlPanel(); break;
            case 'Escape': document.querySelectorAll('.dialog-overlay').forEach(d => d.style.display = 'none'); break;
        }
    });
}

// ============================================
// CSS ANIMATIONS
// ============================================

const _style = document.createElement('style');
_style.textContent = `
@keyframes beltMoveRight { from { transform: translateX(0); } to { transform: translateX(15px); } }
@keyframes beltMoveLeft { from { transform: translateX(0); } to { transform: translateX(-15px); } }
.switch-sub, .led-sub { font-size: 9px; color: #888; font-style: italic; }
`;
document.head.appendChild(_style);
