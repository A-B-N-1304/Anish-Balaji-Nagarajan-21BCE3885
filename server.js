const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const BOARD_SIZE = 5;
const PLAYERS = { A: 'Player A', B: 'Player B' };
const CHARACTERS = { P1: 'Pawn', H1: 'Hero1', H2: 'Hero2' };

// Initialize an empty board and place initial pieces
function initializeBoard() {
    const board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));

    // Place Player A's pieces
    board[4][0] = 'A-P1';
    board[4][1] = 'A-H1';
    board[4][2] = 'A-H2';

    // Place Player B's pieces
    board[0][2] = 'B-H2';
    board[0][3] = 'B-H1';
    board[0][4] = 'B-P1';

    return board;
}

// Class representing a game
class Game {
    constructor() {
        this.board = initializeBoard();
        this.currentTurn = 'A'; // Player A starts
        this.players = { A: null, B: null };
        this.gameOver = false;
    }

    addPlayer(player) {
        if (!this.players.A) {
            this.players.A = player;
            return 'A';
        } else if (!this.players.B) {
            this.players.B = player;
            return 'B';
        } else {
            return null;
        }
    }

    isValidMove(player, move) {
        if (this.currentTurn !== player) return false;
        if (!move.character || !move.direction) return false;
        return true;
    }

    applyMove(player, move) {
        if (!this.isValidMove(player, move)) {
            return { success: false, message: 'Invalid move' };
        }

        const { character, direction } = move;

        // Find character's current position
        let charPos = null;
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (this.board[i][j] === `${player}-${character}`) {
                    charPos = { i, j };
                    break;
                }
            }
            if (charPos) break;
        }

        if (!charPos) {
            return { success: false, message: 'Character not found on board' };
        }

        const newPosition = this.calculateNewPosition(charPos, direction, character);
        if (!this.isValidPosition(newPosition)) {
            return { success: false, message: 'Invalid move direction' };
        }

        // Check if the new position is occupied by the opponent's piece
        const targetPiece = this.board[newPosition.i][newPosition.j];
        if (targetPiece && targetPiece.charAt(0) === player) {
            return { success: false, message: 'Cannot move to a position occupied by your own piece' };
        }

        // Apply the move
        this.board[charPos.i][charPos.j] = null;
        this.board[newPosition.i][newPosition.j] = `${player}-${character}`;

        // Check if the game is won
        if (this.checkWinCondition(newPosition)) {
            this.gameOver = true;
            return { success: true, win: true, winner: player };
        }

        // Change turn
        this.currentTurn = player === 'A' ? 'B' : 'A';
        return { success: true, win: false, move: { character, direction } };
    }

    calculateNewPosition(position, direction, character) {
        let { i, j } = position;

        switch (direction) {
            case 'L':
                j -= 1;
                break;
            case 'R':
                j += 1;
                break;
            case 'F':
                i -= character === 'P1' ? 1 : 0;
                break;
            case 'B':
                i += character === 'P1' ? 1 : 0;
                break;
            case 'FL':
                i -= 1;
                j -= 1;
                break;
            case 'FR':
                i -= 1;
                j += 1;
                break;
            case 'BL':
                i += 1;
                j -= 1;
                break;
            case 'BR':
                i += 1;
                j += 1;
                break;
            default:
                break;
        }
        return { i, j };
    }

    isValidPosition(position) {
        return position.i >= 0 && position.i < BOARD_SIZE && position.j >= 0 && position.j < BOARD_SIZE;
    }

    checkWinCondition(position) {
        // Simple win condition: reaching opponent's back row with any piece
        if (position.i === 0 || position.i === BOARD_SIZE - 1) {
            return true;
        }
        return false;
    }
}

const game = new Game();

wss.on('connection', (ws) => {
    const player = game.addPlayer(ws);
    if (!player) {
        ws.send(JSON.stringify({ type: 'error', message: 'Game is full' }));
        ws.close();
        return;
    }

    ws.send(JSON.stringify({ type: 'init', player, board: game.board, currentTurn: game.currentTurn }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'move') {
            const result = game.applyMove(player, data.move);
            if (result.success) {
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: result.win ? 'win' : 'update',
                            board: game.board,
                            currentTurn: game.currentTurn,
                            move: data.move,
                            winner: result.win ? player : null
                        }));
                    }
                });
            } else {
                ws.send(JSON.stringify({ type: 'error', message: result.message }));
            }
        }
    });

    ws.on('close', () => {
        if (game.players.A === ws) game.players.A = null;
        if (game.players.B === ws) game.players.B = null;
    });
});

server.listen(8080, () => {
    console.log('Server is running on http://localhost:8080');
});

