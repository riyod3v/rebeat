import React from 'react';
import { FaUser, FaTimes } from 'react-icons/fa';

export function RegistrationModal({ onClose, onOpenAccount, onOpenRegistration }) {
  return (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="am-header">
          <div className="am-profile-avatar" style={{ fontSize: '24px' }}>
            <FaUser />
          </div>
          <h2 className="am-title">Registration Required</h2>
          <p className="am-subtitle">
            You need to be registered to record your music
          </p>
        </div>

        {/* Message */}
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <p style={{ color: '#8b92a9', marginBottom: '16px' }}>
            Join our community to save your recordings and track your progress!
          </p>
        </div>

        {/* Actions */}
        <button
          type="button"
          className="am-cta"
          onClick={() => {
            onClose();
            if (onOpenRegistration) {
              onOpenRegistration();
            } else {
              onOpenAccount();
            }
          }}
        >
          Register Now
        </button>

        {/* Skip option for guest users */}
        <p className="am-footer">
          Already have an account?{' '}
          <button 
            type="button" 
            className="am-link" 
            onClick={() => {
              onClose();
              onOpenAccount();
            }}
          >
            Login
          </button>
        </p>

        {/* Close button */}
        <button type="button" className="am-close-btn" onClick={onClose} aria-label="Close">
          <FaTimes />
        </button>
      </div>
    </div>
  );
}
