import React, { useState } from 'react';
import './App.css';

function App() {
  // State to store medications
  const [medications, setMedications] = useState([]);
  const [medName, setMedName] = useState('');
  const [medTime, setMedTime] = useState('');

  // Function to add medication
  const addMedication = () => {
    // YOUR TASK: Add the new medication to the medications array
    // Hint: Use setMedications() and the spread operator [...]
    
  };

  return (
    <div className="App">
      <h1>Medication Tracker</h1>
      
      <div>
        <input 
          placeholder="Medication name"
          value={medName}
          onChange={(e) => setMedName(e.target.value)}
        />
        <input 
          placeholder="Time (e.g., 9:00)"
          value={medTime}
          onChange={(e) => setMedTime(e.target.value)}
        />
        <button onClick={addMedication}>Add Medication</button>
      </div>

      <h2>My Medications:</h2>
      <ul>
        {/* YOUR TASK: Use .map() to display each medication */}
        
      </ul>
    </div>
  );
}

export default App;
