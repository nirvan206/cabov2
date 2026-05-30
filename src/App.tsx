import React from 'react';
import { GameTable } from './components/Game/Table/GameTable';
import { SetupScreen } from './components/Game/SetupScreen';
import { useGameStore } from './store/gameStore';
import './App.css';

const App: React.FC = () => {
  const gamePhase = useGameStore(state => state.gamePhase);

  return (
    <div className="App">
      {gamePhase === 'setup' ? <SetupScreen /> : <GameTable />}
    </div>
  );
};

export default App;