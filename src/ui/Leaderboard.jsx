import React, { useState, useEffect } from 'react';
import { FaTrophy, FaSync, FaTimes, FaMedal } from 'react-icons/fa';
import { supabase } from '../services/supabaseClient';
import { logger } from '../utils/logger';
import './Leaderboard.css';

const Leaderboard = ({ isVisible, currentScore, currentUser, onClose }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isVisible) {
      fetchLeaderboard();
    }
  }, [isVisible, currentScore]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('top_score', { ascending: false })
        .limit(10);

      if (error) {
        logger.warn('Leaderboard view not available, falling back to profiles table', { error });
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, high_score')
          .gt('high_score', 0)
          .order('high_score', { ascending: false })
          .limit(10);
          
        if (profileError) {
          logger.error('Error fetching profiles for leaderboard', profileError);
          return;
        }
        
        const transformedData = (profileData || []).map(profile => ({
          username: profile.username,
          top_score: profile.high_score,
          best_level: null,
          score_date: null
        }));
        
        setLeaderboardData(transformedData);
        return;
      }

      setLeaderboardData(data || []);
    } catch (err) {
      logger.error('Failed to fetch leaderboard', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <aside className="leaderboard" onClick={(e) => e.stopPropagation()}>
      <div className="leaderboard-header">
        <h3><FaTrophy style={{ marginRight: '8px', color: '#f1c40f' }} /> Leaderboard</h3>
        <div className="leaderboard-header-buttons">
          <button 
            className="leaderboard-refresh" 
            onClick={fetchLeaderboard}
            disabled={loading}
            title="Refresh"
          >
            <FaSync className={loading ? 'fa-spin' : ''} />
          </button>
          <button 
            className="leaderboard-close" 
            onClick={onClose}
            title="Close"
          >
            <FaTimes />
          </button>
        </div>
      </div>
      
      <div className="leaderboard-content">
        {loading ? (
          <div className="leaderboard-loading">
            <FaSync className="fa-spin" style={{ fontSize: '24px', marginBottom: '12px', opacity: 0.5 }} />
            <p>Loading scores...</p>
          </div>
        ) : leaderboardData.length === 0 ? (
          <div className="leaderboard-empty">
            <FaMedal style={{ fontSize: '32px', marginBottom: '16px', opacity: 0.2 }} />
            <p>No scores yet!</p>
            <p style={{ fontSize: '12px', opacity: 0.6 }}>Be the first to reach the top!</p>
          </div>
        ) : (
          <div className="leaderboard-list">
            {leaderboardData.map((entry, index) => (
              <div 
                key={entry.username} 
                className={`leaderboard-item ${currentUser?.username === entry.username ? 'current-user' : ''}`}
              >
                <div className="leaderboard-rank">
                  {index === 0 && <span style={{ color: '#f1c40f' }}>🥇</span>}
                  {index === 1 && <span style={{ color: '#bdc3c7' }}>🥈</span>}
                  {index === 2 && <span style={{ color: '#e67e22' }}>🥉</span>}
                  {index > 2 && <span style={{ fontSize: '14px', fontWeight: '700', opacity: 0.3 }}>{index + 1}</span>}
                </div>
                <div className="leaderboard-info">
                  <div className="leaderboard-username">{entry.username}</div>
                  <div className="leaderboard-details">
                    <span className="leaderboard-score">{entry.top_score.toLocaleString()}</span>
                    {entry.best_level && (
                      <span className="leaderboard-level">Lvl {entry.best_level}</span>
                    )}
                  </div>
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
