import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { FaPlay, FaDownload, FaTrash, FaTimes } from 'react-icons/fa';
import './RecordingsModal.css';

export function RecordingsModal({ isVisible, onClose, currentUser }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isVisible && currentUser) {
      fetchRecordings();
    }
  }, [isVisible, currentUser]);

  const fetchRecordings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const userId = currentUser.id || currentUser.authId;
      const { data, error: fetchError } = await supabase
        .from('recordings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      setRecordings(data || []);
    } catch (err) {
      console.error('Error fetching recordings:', err);
      setError('Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recordingId) => {
    if (!confirm('Are you sure you want to delete this recording?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('recordings')
        .delete()
        .eq('id', recordingId);

      if (deleteError) throw deleteError;

      // Remove from local state
      setRecordings(recordings.filter(r => r.id !== recordingId));
    } catch (err) {
      console.error('Error deleting recording:', err);
      alert('Failed to delete recording');
    }
  };

  const handleDownload = (audioUrl, title) => {
    if (!audioUrl) {
      alert('No audio file available for this recording');
      return;
    }

    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${title.replace(/\s+/g, '_')}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (!isVisible) return null;

  return (
    <div className="recordings-modal-overlay" onClick={onClose}>
      <div className="recordings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recordings-modal-header">
          <h2>My Recordings</h2>
          <button className="recordings-close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="recordings-modal-content">
          {loading && (
            <div className="recordings-loading">Loading recordings...</div>
          )}

          {error && (
            <div className="recordings-error">{error}</div>
          )}

          {!loading && !error && recordings.length === 0 && (
            <div className="recordings-empty">
              <p>No recordings yet</p>
              <p className="recordings-empty-hint">
                Click the Record button in Freestyle mode to save your performances
              </p>
            </div>
          )}

          {!loading && !error && recordings.length > 0 && (
            <div className="recordings-list">
              {recordings.map((recording) => (
                <div key={recording.id} className="recording-item">
                  <div className="recording-info">
                    <div className="recording-title">{recording.title}</div>
                    <div className="recording-date">{formatDate(recording.created_at)}</div>
                  </div>
                  <div className="recording-actions">
                    {recording.audio_url && (
                      <>
                        <button
                          className="recording-btn recording-btn-play"
                          onClick={() => window.open(recording.audio_url, '_blank')}
                          title="Play recording"
                        >
                          <FaPlay />
                        </button>
                        <button
                          className="recording-btn recording-btn-download"
                          onClick={() => handleDownload(recording.audio_url, recording.title)}
                          title="Download recording"
                        >
                          <FaDownload />
                        </button>
                      </>
                    )}
                    <button
                      className="recording-btn recording-btn-delete"
                      onClick={() => handleDelete(recording.id)}
                      title="Delete recording"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
