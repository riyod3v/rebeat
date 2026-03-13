import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import './Leaderboard.css';

const Leaderboard = ({ isVisible, currentScore, currentUser }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isVisible) {
      fetchLeaderboard();
    }
  }, [isVisible]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      // Fetch the leaderboard view from Supabase
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('top_score', { ascending: false }) // highest scores first
        .limit(10);

      if (error) {
        return;
      }

      setLeaderboardData(data || []);
    } catch (err) {
      // Failed to fetch leaderboard
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <aside className="leaderboard">
      <div className="leaderboard-header">
        <h3>🏆 Leaderboard</h3>
        <button 
          className="leaderboard-refresh" 
          onClick={fetchLeaderboard}
          disabled={loading}
        >
          {loading ? '...' : '↻'}
        </button>
      </div>
      
      <div className="leaderboard-content">
        {loading ? (
          <div className="leaderboard-loading">Loading...</div>
        ) : leaderboardData.length === 0 ? (
          <div className="leaderboard-empty">
            <p>No scores yet!</p>
            <p>Be the first to play!</p>
          </div>
        ) : (
          <div className="leaderboard-list">
            {leaderboardData.map((entry, index) => (
              <div 
                key={entry.username} 
                className={`leaderboard-item ${currentUser?.username === entry.username ? 'current-user' : ''}`}
              >
                <div className="leaderboard-rank">
                  {index === 0 && '🥇'}
                  {index === 1 && '🥈'}
                  {index === 2 && '🥉'}
                  {index > 2 && `${index + 1}.`}
                </div>
                <div className="leaderboard-info">
                  <div className="leaderboard-username">{entry.username}</div>
                  <div className="leaderboard-score">{entry.top_score}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export { Leaderboard };
