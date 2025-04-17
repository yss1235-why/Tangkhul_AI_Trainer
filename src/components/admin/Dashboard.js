import React, { useState, useEffect } from "react";
import { database } from "../../services/firebase";
import { ref, get, set, remove } from "firebase/database";
import { useAuth } from "../../contexts/AuthContext";

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [pendingTrainers, setPendingTrainers] = useState([]);
  const [activeTrainers, setActiveTrainers] = useState([]);
  const [datasetStats, setDatasetStats] = useState({
    totalExamples: 0,
    uniqueTrainers: 0,
    categories: {}
  });
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Load pending trainers
  useEffect(() => {
    const pendingTrainersRef = ref(database, "pendingTrainers");
    get(pendingTrainersRef).then((snapshot) => {
      if (snapshot.exists()) {
        const trainers = [];
        snapshot.forEach((childSnapshot) => {
          trainers.push({
            id: childSnapshot.key,
            ...childSnapshot.val()
          });
        });
        setPendingTrainers(trainers);
      }
    });
  }, []);

  // Load active trainers
  useEffect(() => {
    const trainersRef = ref(database, "trainers");
    get(trainersRef).then((snapshot) => {
      if (snapshot.exists()) {
        const trainers = [];
        snapshot.forEach((childSnapshot) => {
          trainers.push({
            id: childSnapshot.key,
            ...childSnapshot.val()
          });
        });
        setActiveTrainers(trainers);
      }
    });
  }, []);

  // Load dataset statistics
  useEffect(() => {
    const examplesRef = ref(database, "languageExamples");
    get(examplesRef).then((snapshot) => {
      if (snapshot.exists()) {
        const examples = [];
        const trainerIds = new Set();
        const categories = {};
        
        snapshot.forEach((childSnapshot) => {
          const example = childSnapshot.val();
          examples.push(example);
          
          if (example.trainerId) {
            trainerIds.add(example.trainerId);
          }
          
          if (example.category) {
            categories[example.category] = (categories[example.category] || 0) + 1;
          }
        });
        
        setDatasetStats({
          totalExamples: examples.length,
          uniqueTrainers: trainerIds.size,
          categories
        });
      }
    });
  }, []);

  async function approveTrainer(trainerId) {
    // Get trainer data
    const pendingRef = ref(database, `pendingTrainers/${trainerId}`);
    const snapshot = await get(pendingRef);
    
    if (snapshot.exists()) {
      const trainerData = snapshot.val();
      
      // Move to active trainers
      await set(ref(database, `trainers/${trainerId}`), {
        ...trainerData,
        status: "active",
        approvalDate: Date.now()
      });
      
      // Remove from pending
      await remove(pendingRef);
      
      // Update state
      setPendingTrainers(pendingTrainers.filter(trainer => trainer.id !== trainerId));
      setActiveTrainers([...activeTrainers, { id: trainerId, ...trainerData, status: "active" }]);
    }
  }

  async function rejectTrainer(trainerId) {
    // Remove from pending
    await remove(ref(database, `pendingTrainers/${trainerId}`));
    
    // Update state
    setPendingTrainers(pendingTrainers.filter(trainer => trainer.id !== trainerId));
  }

  async function generateDatasetExport() {
    try {
      const response = await fetch('/api/dataset-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: new Date(dateRange.startDate).getTime(),
          endDate: new Date(dateRange.endDate).getTime()
        }),
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `tangkhul-dataset-${dateRange.startDate}-to-${dateRange.endDate}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Failed to generate dataset export');
      }
    } catch (error) {
      console.error('Error generating export:', error);
      alert('Error generating dataset export');
    }
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <button
          onClick={handleLogout}
          className="bg-teal-200 text-gray-700 px-4 py-2 rounded hover:bg-teal-300"
        >
          Logout
        </button>
      </div>
      
      {/* Trainer Approval Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Pending Trainer Approvals</h2>
        {pendingTrainers.length === 0 ? (
          <p className="bg-white p-4 rounded shadow">No pending trainers</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded shadow">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registration Date</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingTrainers.map(trainer => (
                  <tr key={trainer.id}>
                    <td className="py-4 px-4 text-sm text-gray-900">{trainer.email}</td>
                    <td className="py-4 px-4 text-sm text-gray-500">
                      {new Date(trainer.registrationDate).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium flex space-x-2">
                      <button 
                        onClick={() => approveTrainer(trainer.id)}
                        className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => rejectTrainer(trainer.id)}
                        className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      
      {/* Dataset Export Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Dataset Export</h2>
        <div className="bg-white p-6 rounded shadow">
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input 
                type="date" 
                value={dateRange.startDate}
                onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                className="border rounded px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input 
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                className="border rounded px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>
            <button 
              onClick={generateDatasetExport}
              className="bg-teal-200 text-gray-700 px-4 py-2 rounded hover:bg-teal-300"
            >
              Generate Export
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-100 p-4 rounded">
              <p className="text-sm text-gray-600">Total Examples</p>
              <p className="text-2xl font-bold text-gray-800">{datasetStats.totalExamples}</p>
            </div>
            <div className="bg-gray-100 p-4 rounded">
              <p className="text-sm text-gray-600">Active Trainers</p>
              <p className="text-2xl font-bold text-gray-800">{activeTrainers.length}</p>
            </div>
            <div className="bg-gray-100 p-4 rounded">
              <p className="text-sm text-gray-600">Contributing Trainers</p>
              <p className="text-2xl font-bold text-gray-800">{datasetStats.uniqueTrainers}</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Active Trainers Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Active Trainers</h2>
        {activeTrainers.length === 0 ? (
          <p className="bg-white p-4 rounded shadow">No active trainers</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded shadow">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approval Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {activeTrainers.map(trainer => (
                  <tr key={trainer.id}>
                    <td className="py-4 px-4 text-sm text-gray-900">{trainer.email}</td>
                    <td className="py-4 px-4 text-sm text-gray-500">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-500">
                      {trainer.approvalDate ? new Date(trainer.approvalDate).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
