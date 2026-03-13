import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import './UserData.css';

const UserData = ({ isVisible, currentUser, onRefresh }) => {
  const [userScores, setUserScores] = useState([]);
  const [userRecordings, setUserRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('scores');

  useEffect(() => {
    if (isVisible && currentUser?.id) {
      fetchUserData();
    }
  }, [isVisible, currentUser?.id]);

  const fetchUserData = async () => {
    if (!currentUser?.id) {
      console.log('No user ID found');
      setLoading(false);
      return;
    }
    
    console.log('Fetching data for user:', currentUser.id);
    setLoading(true);
    try {
      // Fetch user's high scores
      const { data: scoresData, error: scoresError } = await supabase
        .from('high_scores')
        .select('score, level_reached, created_at')
        .eq('user_id', currentUser.id)
        .order('score', { ascending: false })
        .limit(10);

      console.log('Scores data:', scoresData);
      console.log('Scores error:', scoresError);

      // Fetch user's recordings
      const { data: recordingsData, error: recordingsError } = await supabase
        .from('recordings')
        .select('title, audio_url, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(10);

      console.log('Recordings data:', recordingsData);
      console.log('Recordings error:', recordingsError);

      if (scoresError) {
        console.error('Error fetching scores:', scoresError);
      } else {
        setUserScores(scoresData || []);
      }

      if (recordingsError) {
        console.error('Error fetching recordings:', recordingsError);
      } else {
        setUserRecordings(recordingsData || []);
      }
    } catch (err) {
      console.error('Failed to fetch user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchUserData();
    if (onRefresh) {
      onRefresh();
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const playRecording = (audioUrl) => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {
        // Failed to play audio
      });
    }
  };

  if (!isVisible || !currentUser) return null;

  return (
    <div className="user-data">
      <div className="user-data-header">
        <h3>👤 My Data</h3>
        <button 
          className="user-data-refresh" 
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      <div className="user-data-tabs">
        <button 
          className={`tab-button ${activeTab === 'scores' ? 'active' : ''}`}
          onClick={() => setActiveTab('scores')}
        >
          🏆 Scores
        </button>
        <button 
          className={`tab-button ${activeTab === 'recordings' ? 'active' : ''}`}
          onClick={() => setActiveTab('recordings')}
        >
          🎵 Recordings
        </button>
      </div>

      <div className="user-data-content">
        {loading ? (
          <div className="user-data-loading">Loading...</div>
        ) : (
          <>
            {activeTab === 'scores' && (
              <div className="scores-section">
                {userScores.length === 0 ? (
                  <div className="user-data-empty">
                    <p>No scores yet!</p>
                    <p>Play the game to set your first score.</p>
                  </div>
                ) : (
                  <div className="scores-list">
                    {userScores.map((score, index) => (
                      <div key={index} className="score-item">
                        <div className="score-rank">#{index + 1}</div>
                        <div className="score-info">
                          <div className="score-value">{score.score}</div>
                          <div className="score-level">Level {score.level_reached}</div>
                          <div className="score-date">{formatDate(score.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'recordings' && (
              <div className="recordings-section">
                {userRecordings.length === 0 ? (
                  <div className="user-data-empty">
                    <p>No recordings yet!</p>
                    <p>Start recording in freestyle mode.</p>
                  </div>
                ) : (
                  <div className="recordings-list">
                    {userRecordings.map((recording, index) => (
                      <div key={index} className="recording-item">
                        <div className="recording-info">
                          <div className="recording-title">{recording.title}</div>
                          <div className="recording-date">{formatDate(recording.created_at)}</div>
                        </div>
                        {recording.audio_url && (
                          <button 
                            className="play-button"
                            onClick={() => playRecording(recording.audio_url)}
                          >
                            ▶️
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export { UserData };
