import { PLAYER_COLOR } from './constants.js';

export class UI {
  constructor() {
    this._root = document.getElementById('ui');
  }

  showStartScreen(onStart) {
    this._render(`
      <div class="screen">
        <h1>LIGHT BIKE</h1>
        <p class="subtitle">Survive the grid</p>
        <button class="btn" id="btn-start">ENTER GRID</button>
      </div>
    `);
    document.getElementById('btn-start').addEventListener('click', () => {
      this.clear();
      onStart();
    });
  }

  showGameOver(winnerBike, onRestart) {
    const isPlayer = winnerBike && winnerBike.id === 1;
    const colorHex = winnerBike
      ? '#' + winnerBike.color.toString(16).padStart(6, '0')
      : '#ffffff';

    const title  = winnerBike ? (isPlayer ? 'VICTORY' : 'GAME OVER') : 'DRAW';
    const label  = winnerBike
      ? (isPlayer ? 'YOU SURVIVED' : 'A BOT WINS')
      : 'ALL BIKES DESTROYED';

    this._render(`
      <div class="screen">
        <h2>${title}</h2>
        <p class="winner-label" style="color:${colorHex}">${label}</p>
        <button class="btn" id="btn-restart">RESTART</button>
      </div>
    `);
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.clear();
      onRestart();
    });
  }

  clear() {
    this._root.innerHTML = '';
  }

  _render(html) {
    this._root.innerHTML = html;
  }
}
