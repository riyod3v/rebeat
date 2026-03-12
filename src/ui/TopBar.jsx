import React, { useState, useEffect, useRef } from 'react';
import { FaUser, FaPlay, FaStop, FaGamepad, FaRedo, FaQuestionCircle, FaDownload, FaTrash } from 'react-icons/fa';
import { GamePhase } from './padStates';

export function TopBar({
  isPlaying,
  onToggleTransport,
  appMode = 'freestyle',
  onModeChange,
  gamePhase = GamePhase.inactive,
  gameLevel = 1,
  gameScore = 0,
  onStartGame,
  onResetGame,
  isRecording = false,
  onToggleRecord,
  hasRecording = false,
  isPlayingRecording = false,
  isExporting = false,
  onPlayRecording,
  onDownloadRecording,
  onClearRecording,
  onShowTutorial,
  onShowAccount,
  onRestartGame,
  currentUser = null,
}) {
  const isGameMode = appMode === 'game';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef   = useRef(null);

  // Close the hamburger when clicking outside it
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);

  // Helper: run an action and close the menu
  const act = (fn) => () => { fn?.(); setMenuOpen(false); };

  const avatarLabel = currentUser ? currentUser.username.charAt(0).toUpperCase() : null;

  // Derive status text + CSS modifier for the banner
  const statusInfo = (() => {
    if (!isGameMode) return null;
    if (gamePhase === GamePhase.demonstrating)  return { text: 'Watch the sequence…', mod: 'demo' };
    if (gamePhase === GamePhase.waitingForInput) return { text: 'Your turn!',           mod: 'input' };
    if (gamePhase === GamePhase.success)         return { text: 'Level Complete!',       mod: 'success' };
    if (gamePhase === GamePhase.gameOver)        return { text: 'Game Over!',            mod: 'gameover' };
    return null;
  })();

  return (
    <>
    <header className={`lp-topbar lp-topbar--${appMode}`}>

      {/* ── LEFT: Brand + Mode Toggle + Mode Label ── */}
      <div className="lp-topbar__left">
        <img src="/icons/icon-32.png" alt="Rebeat" className="lp-logo" />
        <span className="lp-brand">Rebeat</span>

        <div className="lp-mode-toggle">
          <button
            type="button"
            className={`lp-mode-btn ${!isGameMode ? 'lp-mode-btn--active' : ''}`}
            onClick={() => { onModeChange?.('freestyle'); setMenuOpen(false); }}
          >
            Freestyle
          </button>
          <button
            type="button"
            className={`lp-mode-btn lp-mode-btn--game ${isGameMode ? 'lp-mode-btn--active lp-mode-btn--game-active' : ''}`}
            onClick={() => { onModeChange?.('game'); setMenuOpen(false); }}
          >
            Game
          </button>
        </div>

        <span className="lp-mode-label">
          MODE: <strong>{appMode.toUpperCase()}</strong>
        </span>
      </div>

      {/* ── CENTER: Transport Controls (desktop always / mobile: game-only) ── */}
      <div className="lp-topbar__center">
        {!isGameMode ? (
          <>
            <button className="lp-btn lp-btn--transport" type="button" onClick={onToggleTransport}>
              {isPlaying ? 'Stop' : 'Play'}
            </button>
            <button
              className={`lp-btn lp-btn--record ${isRecording ? 'lp-btn--record-active' : ''}`}
              type="button"
              onClick={onToggleRecord}
              disabled={isPlayingRecording}
            >
              <span className="lp-record-dot" />
              {isRecording ? 'Stop Rec' : 'Record'}
            </button>
            {hasRecording && !isRecording && (
              <>
                <button
                  className={`lp-btn lp-btn--playback ${isPlayingRecording ? 'lp-btn--playback-active' : ''}`}
                  type="button"
                  onClick={onPlayRecording}
                  disabled={isPlayingRecording || isExporting}
                  title="Play recording"
                >
                  <FaPlay /> Play Rec
                </button>
                <button
                  className={`lp-btn lp-btn--download ${isExporting ? 'lp-btn--download-active' : ''}`}
                  type="button"
                  onClick={onDownloadRecording}
                  disabled={isExporting}
                  title="Download recording as WAV"
                >
                  {isExporting ? '...' : <FaDownload />}
                </button>
                <button
                  className="lp-btn lp-btn--clear"
                  type="button"
                  onClick={onClearRecording}
                  disabled={isExporting}
                  title="Clear recording"
                >
                  <FaTrash />
                </button>
              </>
            )}
          </>
        ) : (
          <>
            {/* Start Game — desktop only; mobile uses hamburger */}
            {gamePhase === GamePhase.ready && (
              <button className="lp-btn lp-btn--game-start lp-desktop-only" type="button" onClick={onStartGame}>
                Start Game
              </button>
            )}
            {/* Status messages — desktop only; mobile gets the banner below the header */}
            {gamePhase === GamePhase.demonstrating && (
              <div className="lp-game-status lp-game-status--demo lp-desktop-only">Watch the sequence…</div>
            )}
            {gamePhase === GamePhase.waitingForInput && (
              <div className="lp-game-status lp-game-status--input lp-desktop-only">Your turn!</div>
            )}
            {gamePhase === GamePhase.success && (
              <div className="lp-game-status lp-game-status--success lp-desktop-only">Level Complete!</div>
            )}
            {gamePhase === GamePhase.gameOver && (
              <>
                <div className="lp-game-status lp-game-status--gameover lp-desktop-only">Game Over!</div>
                {/* Play Again — desktop only; mobile uses hamburger */}
                <button className="lp-btn lp-btn--game-reset lp-desktop-only" type="button" onClick={onResetGame}>
                  Play Again
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT: HUD + Account (desktop) / Hamburger (mobile) ── */}
      <div className="lp-topbar__right" ref={menuRef}>

        {/* Game stats — always visible; compact on mobile, full-size on desktop */}
        {isGameMode && (
          <div className="lp-game-stats">
            <div className="lp-game-stat">
              <span className="lp-game-stat__label">LEVEL</span>
              <span className="lp-game-stat__value">{gameLevel}</span>
            </div>
            <div className="lp-game-stat">
              <span className="lp-game-stat__label">SCORE</span>
              <span className="lp-game-stat__value">{gameScore}</span>
            </div>
            {/* Tutorial — desktop always, mobile hidden behind hamburger */}
            <button className="lp-btn lp-btn--tutorial lp-desktop-only" type="button" onClick={onShowTutorial}>
              <span className="lp-tutorial-icon">?</span>
              Tutorial
            </button>
          </div>
        )}

        {/* ── Desktop: account icon ── */}
        <button
          type="button"
          className="lp-btn lp-btn--account lp-desktop-only"
          onClick={onShowAccount}
          aria-label={currentUser ? `Account: ${currentUser.username}` : 'Login / Register'}
        >
          {avatarLabel
            ? <span className="lp-account-avatar">{avatarLabel}</span>
            : <FaUser />
          }
        </button>

        {/* ── Mobile: hamburger toggle ── */}
        <button
          type="button"
          className={`lp-btn lp-hamburger-btn lp-mobile-only ${menuOpen ? 'lp-hamburger-btn--open' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <span className="lp-hamburger-bar" />
          <span className="lp-hamburger-bar" />
          <span className="lp-hamburger-bar" />
        </button>

        {/* ── Hamburger dropdown panel ── */}
        {menuOpen && (
          <div className="lp-hamburger-menu" role="menu">
            {/* Freestyle items */}
            {!isGameMode && (
              <>
                <button
                  type="button"
                  className="lp-hamburger-item"
                  onClick={act(onToggleTransport)}
                  role="menuitem"
                >
                  <span className="lp-hi-icon">{isPlaying ? <FaStop /> : <FaPlay />}</span>
                  <span className="lp-hi-label">{isPlaying ? 'Stop' : 'Play'}</span>
                </button>

                <button
                  type="button"
                  className={`lp-hamburger-item ${isRecording ? 'lp-hamburger-item--recording' : ''}`}
                  onClick={act(onToggleRecord)}
                  role="menuitem"
                  disabled={isPlayingRecording}
                >
                  <span className="lp-hi-icon lp-hi-record-dot" />
                  <span className="lp-hi-label">{isRecording ? 'Stop Recording' : 'Record'}</span>
                  {isRecording && <span className="lp-hi-badge">REC</span>}
                </button>
                {hasRecording && !isRecording && (
                  <>
                    <button
                      type="button"
                      className={`lp-hamburger-item ${isPlayingRecording ? 'lp-hamburger-item--playing' : ''}`}
                      onClick={act(onPlayRecording)}
                      role="menuitem"
                      disabled={isPlayingRecording}
                    >
                      <span className="lp-hi-icon"><FaPlay /></span>
                      <span className="lp-hi-label">Play Recording</span>
                    </button>
                    <button
                      type="button"
                      className="lp-hamburger-item"
                      onClick={act(onDownloadRecording)}
                      role="menuitem"
                    >
                      <span className="lp-hi-icon"><FaDownload /></span>
                      <span className="lp-hi-label">Download</span>
                    </button>
                    <button
                      type="button"
                      className="lp-hamburger-item lp-hamburger-item--danger"
                      onClick={act(onClearRecording)}
                      role="menuitem"
                    >
                      <span className="lp-hi-icon"><FaTrash /></span>
                      <span className="lp-hi-label">Clear Recording</span>
                    </button>
                  </>
                )}
              </>
            )}

            {/* Game mode hamburger items */}
            {isGameMode && (
              <>
                {/* Section label */}
                <div className="lp-hi-section-label">GAME</div>

                {/* Start Game — only shown when ready */}
                {gamePhase === GamePhase.ready && (
                  <button
                    type="button"
                    className="lp-hamburger-item lp-hamburger-item--game-start"
                    onClick={act(onStartGame)}
                    role="menuitem"
                  >
                    <span className="lp-hi-icon"><FaGamepad /></span>
                    <span className="lp-hi-label">Start Game</span>
                  </button>
                )}

                {/* Play Again — only shown after game over; restarts from level 1 immediately */}
                {gamePhase === GamePhase.gameOver && (
                  <button
                    type="button"
                    className="lp-hamburger-item lp-hamburger-item--game-reset"
                    onClick={act(onRestartGame)}
                    role="menuitem"
                  >
                    <span className="lp-hi-icon"><FaRedo /></span>
                    <span className="lp-hi-label">Play Again</span>
                  </button>
                )}

                <button
                  type="button"
                  className="lp-hamburger-item"
                  onClick={act(onShowTutorial)}
                  role="menuitem"
                >
                  <span className="lp-hi-icon"><FaQuestionCircle /></span>
                  <span className="lp-hi-label">Tutorial</span>
                </button>
              </>
            )}

            {/* Divider + Account — always present */}
            <div className="lp-hi-divider" />
            <button
              type="button"
              className="lp-hamburger-item"
              onClick={act(onShowAccount)}
              role="menuitem"
            >
              <span className="lp-hi-icon">
                {avatarLabel
                  ? <span className="lp-hi-avatar">{avatarLabel}</span>
                  : <FaUser />
                }
              </span>
              <span className="lp-hi-label">
                {currentUser ? currentUser.username : 'Login / Register'}
              </span>
            </button>
          </div>
        )}
      </div>
    </header>

    {/* ── Game status banner — mobile only, below the navbar ── */}
    {statusInfo && (
      <div className={`lp-game-banner lp-game-banner--${statusInfo.mod} lp-mobile-only`}
           role="status" aria-live="polite">
        {statusInfo.text}
      </div>
    )}
    </>
  );
}
