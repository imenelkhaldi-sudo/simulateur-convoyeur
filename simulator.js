/**
 * SITRAIN Simulator — PLC Simulation Engine
 *
 * Controlled by PLCSim via WebSocket bridge (server.py).
 * - Inputs (I) are sent TO the PLC
 * - Outputs (Q) come FROM the PLC
 *
 * Piece physics:
 * - Pieces move on the belt when PLC activates K_Droite or K_Gauche
 * - ILS sensors (I3.5, I3.6, I3.7) activate when a piece is over them
 * - Optical barrier I3.0 is normally TRUE, goes FALSE when a piece blocks it
 * - Pieces exit the belt at the edges
 */

class PLCSimulator {
    constructor() {
        this.variables = {};
        this.connected = false;
        this.mode = 'simulation';
        this.cycleCount = 0;
        this.startTime = Date.now();
        this.cycleInterval = null;

        // Pieces on the belt: { id, x }
        // x is the SVG x-coordinate on the belt (25..725)
        this.pieces = [];

        // Belt geometry constants
        this.BELT_LEFT = 25;
        this.BELT_RIGHT = 725;
        this.BELT_CENTER_Y = 170;
        this.PIECE_SPEED = 3; // px per cycle (50ms)

        // Sensor x-positions on the belt
        this.SENSOR_POSITIONS = {
            ils1: 180,  // I_.5 (B_Ini1)
            ils2: 310,  // I_.6 (B_Ini2)
            ils3: 440,  // I_.7 (B_Ini3)
            opt:  575   // I_.0 (B_LS — optical barrier)
        };
        this.SENSOR_RANGE = 40; // detection radius ILS in px (large pour compenser la latence reseau)
        this.SENSOR_RANGE_OPT = 16; // detection radius capteur optique (plus precis)

        // WebSocket
        this.ws = null;
        this.wsConnected = false;
        this.wsReconnectTimer = null;
        this.pendingWrites = [];
        this.onStatusChange = null;
        this.onCycleUpdate = null;
        this.onPiecesChanged = null; // callback when pieces change
    }

    // ================================================================
    // EXERCISE INIT
    // ================================================================

    initExercise(exercise) {
        this.variables = {};
        this.pieces = [];

        const sections = [
            { src: exercise.panel.inputs,          dir: 'input',  sec: 'panel' },
            { src: exercise.panel.outputs,         dir: 'output', sec: 'panel' },
            { src: exercise.panel.topLights,       dir: 'output', sec: 'toplight' },
            { src: exercise.panel.analogInputs,    dir: 'input',  sec: 'analog',  type: 'INT' },
            { src: exercise.panel.analogOutputs,   dir: 'output', sec: 'analog',  type: 'INT' },
            { src: exercise.conveyor.sensors,      dir: 'input',  sec: 'conveyor-sensor' },
            { src: exercise.conveyor.stationInputs,dir: 'input',  sec: 'conveyor-btn' },
            { src: exercise.conveyor.stationOutputs,dir:'output', sec: 'conveyor-led' },
            { src: exercise.conveyor.motorOutputs, dir: 'output', sec: 'motor' },
        ];

        for (const s of sections) {
            if (!s.src) continue;
            for (const io of s.src) {
                const isInt = s.type === 'INT';
                this.variables[io.addr] = {
                    value: isInt ? 0 : false,
                    name: io.name || '',
                    type: isInt ? 'INT' : 'BOOL',
                    direction: s.dir,
                    section: s.sec,
                    forced: false,
                    forcedValue: isInt ? 0 : false,
                    label: io.label || '',
                    color: io.color || '',
                    position: io.position,
                    _bit: io._bit
                };
            }
        }

        this.cycleCount = 0;
        this.startTime = Date.now();
    }

    // ================================================================
    // VARIABLE ACCESS
    // ================================================================

    setInput(addr, value) {
        if (this.variables[addr] && !this.variables[addr].forced) {
            this.variables[addr].value = value;
        }
        // Send to PLC if connected
        if (this.wsConnected && this.mode !== 'simulation') {
            this.sendWrite(addr, value);
        }
    }

    getValue(addr) {
        const v = this.variables[addr];
        if (!v) return false;
        return v.forced ? v.forcedValue : v.value;
    }

    setOutput(addr, value) {
        if (this.variables[addr] && !this.variables[addr].forced) {
            this.variables[addr].value = value;
        }
    }

    forceVariable(addr, forced, value) {
        if (this.variables[addr]) {
            this.variables[addr].forced = forced;
            this.variables[addr].forcedValue = value;
        }
    }

    getByName(name) {
        for (const [addr, v] of Object.entries(this.variables)) {
            if (v.name === name) return this.getValue(addr);
        }
        return false;
    }

    findAddrByName(name) {
        for (const [addr, v] of Object.entries(this.variables)) {
            if (v.name === name) return addr;
        }
        return null;
    }

    // Find address by section and bit
    findAddr(section, bit) {
        for (const [addr, v] of Object.entries(this.variables)) {
            if (v.section === section && v._bit === bit) return addr;
        }
        return null;
    }

    // ================================================================
    // CONNECTION
    // ================================================================

    connect(mode, options = {}) {
        this.mode = mode;
        this.connected = true;
        this.startCycle();
        if (mode === 'plcsim' || mode === 'plc') {
            this.connectWebSocket(options);
        }
    }

    disconnect() {
        this.connected = false;
        this.stopCycle();
        this.disconnectWebSocket();
    }

    // ================================================================
    // WEBSOCKET
    // ================================================================

    connectWebSocket(options = {}) {
        const host = options.wsHost || 'localhost';
        const port = options.wsPort || 8766;
        const url = `ws://${host}:${port}`;

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            console.error('[WS] Cannot create WebSocket:', e);
            return;
        }

        this.ws.onopen = () => {
            this.wsConnected = true;
            if (options.plcIp) {
                this.ws.send(JSON.stringify({
                    type: 'connect_plc',
                    ip: options.plcIp,
                    rack: options.rack || 0,
                    slot: options.slot || 1
                }));
            }
            const addresses = Object.keys(this.variables);
            this.ws.send(JSON.stringify({ type: 'subscribe', addresses }));
            this.flushPendingWrites();
        };

        this.ws.onmessage = (event) => this.handleWsMessage(event.data);

        this.ws.onclose = () => {
            this.wsConnected = false;
            if (this.connected && this.mode !== 'simulation') {
                this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(options), 3000);
            }
        };

        this.ws.onerror = (err) => console.error('[WS] Error:', err);
    }

    disconnectWebSocket() {
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
        }
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.wsConnected = false;
    }

    handleWsMessage(rawData) {
        let data;
        try { data = JSON.parse(rawData); } catch (e) { return; }

        switch (data.type) {
            case 'status':
                if (this.onStatusChange) this.onStatusChange(data);
                break;
            case 'update':
                if (data.variables) {
                    for (const [addr, value] of Object.entries(data.variables)) {
                        // Jumeau numérique : accepter toutes les variables (I et Q) du PLC
                        if (this.variables[addr]) {
                            this.variables[addr].value = value;
                        }
                    }
                }
                if (data.cycle !== undefined) this.cycleCount = data.cycle;
                break;
            case 'read_response':
                if (this.variables[data.addr]) this.variables[data.addr].value = data.value;
                break;
            case 'read_all_response':
                if (data.variables) {
                    for (const [addr, value] of Object.entries(data.variables)) {
                        if (this.variables[addr]) this.variables[addr].value = value;
                    }
                }
                break;
        }
    }

    sendWrite(addr, value) {
        if (!this.wsConnected || !this.ws) {
            this.pendingWrites.push({ addr, value });
            return;
        }
        this.ws.send(JSON.stringify({ type: 'write', addr, value }));
    }

    flushPendingWrites() {
        if (this.pendingWrites.length > 0 && this.wsConnected && this.ws) {
            this.ws.send(JSON.stringify({ type: 'write_batch', variables: this.pendingWrites }));
            this.pendingWrites = [];
        }
    }

    /** Re-subscribe with current variable addresses (after model/exercise change) */
    resubscribe() {
        if (this.wsConnected && this.ws) {
            const addresses = Object.keys(this.variables);
            this.ws.send(JSON.stringify({ type: 'subscribe', addresses }));
            console.log('[WS] Re-subscribed with', addresses.length, 'variables');
        }
    }

    // ================================================================
    // CYCLE
    // ================================================================

    startCycle() {
        if (this.cycleInterval) clearInterval(this.cycleInterval);
        this.cycleInterval = setInterval(() => this.executeCycle(), 50);
    }

    stopCycle() {
        if (this.cycleInterval) { clearInterval(this.cycleInterval); this.cycleInterval = null; }
    }

    executeCycle() {
        if (!this.connected) return;
        this.cycleCount++;

        // Always run piece physics (driven by PLC output values)
        this.updatePiecePhysics();

        if (this.onCycleUpdate) this.onCycleUpdate();
    }

    // ================================================================
    // PIECE PHYSICS — driven by PLC motor outputs
    // ================================================================

    updatePiecePhysics() {
        // Read motor outputs (set by PLC)
        const kDroite = this.getByName('K_Droite');
        const kGauche = this.getByName('K_Gauche');

        let piecesChanged = false;

        if (kDroite || kGauche) {
            const dx = kDroite ? this.PIECE_SPEED : (kGauche ? -this.PIECE_SPEED : 0);

            for (let i = this.pieces.length - 1; i >= 0; i--) {
                this.pieces[i].x += dx;

                // Remove piece if it exits the belt
                if (this.pieces[i].x < this.BELT_LEFT - 20 || this.pieces[i].x > this.BELT_RIGHT + 20) {
                    this.pieces.splice(i, 1);
                    piecesChanged = true;
                }
            }
            if (this.pieces.length > 0) piecesChanged = true;
        }

        // Update all sensor states based on current piece positions
        this.updateSensorsFromPieces();

        if (piecesChanged && this.onPiecesChanged) {
            this.onPiecesChanged();
        }
    }

    /**
     * Update all conveyor sensor inputs based on where pieces are.
     * - ILS sensors (B_Ini1/2/3): TRUE when a piece is within range
     * - Optical barrier (B_LS): normally TRUE, FALSE when a piece blocks it
     */
    updateSensorsFromPieces() {
        const sensors = [
            { bit: 5, x: this.SENSOR_POSITIONS.ils1, type: 'ils' },
            { bit: 6, x: this.SENSOR_POSITIONS.ils2, type: 'ils' },
            { bit: 7, x: this.SENSOR_POSITIONS.ils3, type: 'ils' },
            { bit: 0, x: this.SENSOR_POSITIONS.opt,  type: 'opt' },
        ];

        for (const sensor of sensors) {
            const addr = this.findAddr('conveyor-sensor', sensor.bit);
            if (!addr) continue;

            const range = sensor.type === 'opt' ? this.SENSOR_RANGE_OPT : this.SENSOR_RANGE;
            const piecePresent = this.pieces.some(p =>
                Math.abs(p.x - sensor.x) < range
            );

            if (sensor.type === 'ils') {
                // ILS: TRUE when piece detected
                this.setInput(addr, piecePresent);
            } else {
                // Optical: normally TRUE, FALSE when piece blocks beam
                this.setInput(addr, !piecePresent);
            }
        }
    }

    // ================================================================
    // PIECE MANAGEMENT
    // ================================================================

    /**
     * Place a piece at a given ILS sensor position (station 1, 2, or 3)
     */
    placePiece(stationIndex) {
        const xMap = { 1: this.SENSOR_POSITIONS.ils1, 2: this.SENSOR_POSITIONS.ils2, 3: this.SENSOR_POSITIONS.ils3 };
        const x = xMap[stationIndex];
        if (!x) return;

        const id = Date.now() + Math.random();
        this.pieces.push({ id, x, station: stationIndex });

        // Immediately update sensors
        this.updateSensorsFromPieces();
        if (this.onPiecesChanged) this.onPiecesChanged();

        return id;
    }

    removePiece(pieceId) {
        const idx = this.pieces.findIndex(p => p.id === pieceId);
        if (idx >= 0) {
            this.pieces.splice(idx, 1);
            this.updateSensorsFromPieces();
            if (this.onPiecesChanged) this.onPiecesChanged();
        }
    }

    // ================================================================
    // VARIABLE TABLE
    // ================================================================

    getAllVariables(filter) {
        const result = [];
        for (const [addr, v] of Object.entries(this.variables)) {
            if (filter === 'inputs' && v.direction !== 'input') continue;
            if (filter === 'outputs' && v.direction !== 'output') continue;
            if (filter === 'analog' && v.type !== 'INT') continue;
            // Object.assign plutot que { ...v } : l'ancien Edge (EdgeHTML) ne connait pas la decomposition d'objet
            result.push(Object.assign({ addr }, v, { currentValue: this.getValue(addr) }));
        }
        return result.sort((a, b) => a.addr.localeCompare(b.addr));
    }
}
