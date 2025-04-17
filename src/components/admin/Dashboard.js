// src/components/admin/Dashboard.js
import React, { useState, useEffect } from "react";
import { database } from "../../services/firebase";
import { ref, get, set, remove } from "firebase/database";

export default function AdminDashboard() {
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
    // This would typically call a serverless function
    // For this implementation, we'll use a placeholder
    alert(`Dataset export initiated for date range: ${dateRange.startDate} to ${dateRange.endDate}`);
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      {/* Trainer Approval Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Pending Trainer Approvals</h2>
        {pendingTrainers.length === 0 ? (
          <p>No pending trainers</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b">Email</th>
                  <th className="py-2 px-4 border-b">Registration Date</th>
                  <th className="py-2 px-4 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingTrainers.map(trainer => (
                  <tr key={trainer.id}>
                    <td className="py-2 px-4 border-b">{trainer.email}</td>
                    <td className="py-2 px-4 border-b">
                      {new Date(trainer.registrationDate).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4 border-b flex space-x-2">
                      <button 
                        onClick={() => approveTrainer(trainer.id)}
                        className="bg-green-500 text-white px-3 py-1 rounded"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => rejectTrainer(trainer.id)}
                        className="bg-red-500 text-white px-3 py-1 rounded"
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
        <div className="bg-white p-4 rounded shadow">
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input 
                type="date" 
                value={dateRange.startDate}
                onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                className="border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input 
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                className="border rounded px-3 py-2"
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
            <div className="bg-gray-100 p-3 rounded">
              <p className="text-sm text-gray-600">Total Examples</p>
              <p className="text-2xl font-bold">{datasetStats.totalExamples}</p>
            </div>
            <div className="bg-gray-100 p-3 rounded">
              <p className="text-sm text-gray-600">Active Trainers</p>
              <p className="text-2xl font-bold">{activeTrainers.length}</p>
            </div>
            <div className="bg-gray-100 p-3 rounded">
              <p className="text-sm text-gray-600">Contributing Trainers</p>
              <p className="text-2xl font-bold">{datasetStats.uniqueTrainers}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
