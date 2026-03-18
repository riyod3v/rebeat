import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

import { AudioEngine } from './engine/AudioEngine';
import { getDemoProject } from './engine/demoProject';
import { buildUnifiedGridPads } from './engine/buildPads';
import { PadState, GamePhase } from './ui/padStates';
import { TopBar } from './ui/TopBar';
import { LaunchpadGrid } from './ui/LaunchpadGrid';
import { TutorialModal } from './ui/TutorialModal';
import { AccountModal } from './ui/AccountModal';
import { RegistrationModal } from './ui/RegistrationModal';
import { Leaderboard } from './ui/Leaderboard';
import { supabase } from './services/supabaseClient';

// Fixed tempo - 130 BPM
const FIXED_BPM = 130;
// Fixed quantization - always 1 bar
const FIXED_QUANTIZATION = '1m';

// Game configuration
const GAME_CONFIG = {
  demoHighlightMs: 800,    // How long each pad stays highlighted during demo
  demoGapMs: 200,          // Gap between demo notes (loops layer on top of each other)
  feedbackDurationMs: 400, // How long correct/incorrect feedback shows
  levelUpDelayMs: 2000,    // Delay before next level starts (2 seconds)
  gameOverDelayMs: 2000,   // Delay before allowing restart
};

const App = () => {
  const engineRef = useRef(null);

  // =========================================================================
  // CORE STATE (Freestyle Mode)
  // =========================================================================
  const [project, setProject] = useState(() => getDemoProject());
  const [clipStatesById, setClipStatesById] = useState(() => new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  // =========================================================================
  // GAME MODE STATE
  // =========================================================================
  const [appMode, setAppMode] = useState('freestyle'); // 'freestyle' | 'game'
  const [gamePhase, setGamePhase] = useState(GamePhase.inactive);
  const [gameLevel, setGameLevel] = useState(1);
  const [gameScore, setGameScore] = useState(0);
  const [gameSequence, setGameSequence] = useState([]); // Array of clipIds
  const [playerProgress, setPlayerProgress] = useState(0); // Index in sequence
  const [gameHighlightedPads, setGameHighlightedPads] = useState(new Set());
  const [gameFeedbackPads, setGameFeedbackPads] = useState(new Map());
  const [isRecording, setIsRecording] = useState(false);
  const [lastRecording, setLastRecording] = useState(null); // Holds recorded sequence
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  // Tutorial shown automatically only the FIRST time the user enters Game mode.
  // After that it only appears when the user manually clicks the "?" button.
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);

  // =========================================================================
  // ACCOUNT / AUTH STATE
  // =========================================================================
  const [showAccount, setShowAccount] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false); // Hidden by default, shown when user clicks leaderboard button
  const [currentUser, setCurrentUser] = useState(null); // null = logged out
  
  // Cache playable clip IDs
  const playableClipIds = useRef([]);
  
  // Ref to track if game sequence should be aborted
  const gameAbortRef = useRef(false);
  // Ref to track current game phase (avoid stale closures)
  const gamePhaseRef = useRef(GamePhase.inactive);
  
  // Keep ref in sync with state
  useEffect(() => {
    gamePhaseRef.current = gamePhase;
  }, [gamePhase]);

  // =========================================================================
  // ENGINE INITIALIZATION
  // =========================================================================
  useEffect(() => {
    const engine = new AudioEngine({
      onClipStateChange: (clipId, state) => {
        setClipStatesById((prev) => {
          const next = new Map(prev);
          next.set(clipId, state);
          return next;
        });
      },
    });

    engineRef.current = engine;
    engine.loadProject(project);
    engine.setBpm(FIXED_BPM);
    engine.setTimeSignature(project.global.timeSignature ?? [4, 4]);
    engine.setQuantization(FIXED_QUANTIZATION);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.loadProject(project);
    engine.setTimeSignature(project.global.timeSignature ?? [4, 4]);
  }, [project]);

  // =========================================================================
  // MEMOIZED UI DATA
  // =========================================================================
  // Build the unified pad map AND compute the trimmed row count in one pass.
  // After URL-dedup, custom row 1 (unified row 8) is entirely empty.
  // We scan the Map for the highest content row, remap stop pads to sit
  // immediately below it, then pass the trimmed count to the grid renderer.
  const { unifiedPads, gridRows } = useMemo(() => {
    const rawPads = buildUnifiedGridPads(project, clipStatesById);

    // Find the highest non-stop row that actually has a pad
    let maxContentRow = 0;
    for (const [key, pad] of rawPads) {
      if (pad.type !== 'stop') {
        const row = parseInt(key.split(':')[1], 10);
        if (row > maxContentRow) maxContentRow = row;
      }
    }

    const stopRow   = maxContentRow + 1; // stop row immediately follows content
    const totalRows = stopRow + 1;       // total row count includes the stop row

    // Remap stop pads from their original position to the trimmed stop row
    const pads = new Map();
    for (const [key, pad] of rawPads) {
      if (pad.type === 'stop') {
        const col = key.split(':')[0];
        pads.set(`${col}:${stopRow}`, pad);
      } else {
        pads.set(key, pad);
      }
    }

    return { unifiedPads: pads, gridRows: totalRows };
  }, [project, clipStatesById]);

  // Sync playable clip IDs — only include clips that have a visible pad in the grid
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const allPlayableIds = engine.getPlayableClipIds();
    const visiblePadIds = new Set();
    for (const pad of unifiedPads.values()) {
      if (pad.id) visiblePadIds.add(pad.id);
    }
    playableClipIds.current = allPlayableIds.filter(id => visiblePadIds.has(id));
  }, [unifiedPads]);

  const columnLabels = useMemo(() => {
    const labels = Array(project.grid.columns).fill('');
    for (const track of project.tracks) {
      labels[track.column] = track.name;
    }
    return labels;
  }, [project]);

  const columnColors = useMemo(() => {
    const colors = Array(project.grid.columns).fill('#57606f');
    for (const track of project.tracks) {
      colors[track.column] = track.color ?? '#57606f';
    }
    return colors;
  }, [project]);

  const columnActivity = useMemo(() => {
    const activity = Array(project.grid.columns).fill('idle');
    if (appMode !== 'freestyle') return activity;

    for (const track of project.tracks) {
      const col = track.column;
      let hasPlayingLoop = false;
      let hasQueuedLoop = false;
      for (const clip of track.clips) {
        if (clip.type !== 'loop') continue;
        const st = clipStatesById.get(clip.id);
        if (st === 'playing') hasPlayingLoop = true;
        if (st === 'queued') hasQueuedLoop = true;
      }
      activity[col] =
        hasPlayingLoop && hasQueuedLoop ? 'switching'
        : hasPlayingLoop ? 'playing'
        : hasQueuedLoop ? 'queued'
        : 'idle';
    }
    // Also check custom clips activity
    for (const clip of project.customClips) {
      if (clip.type !== 'loop') continue;
      const st = clipStatesById.get(clip.id);
      const col = clip.column;
      if (st === 'playing' && activity[col] === 'idle') activity[col] = 'playing';
      if (st === 'queued' && activity[col] === 'idle') activity[col] = 'queued';
    }
    return activity;
  }, [project, clipStatesById, appMode]);

  // =========================================================================
  // AUDIO INITIALIZATION
  // =========================================================================
  const ensureAudioReady = async () => {
    if (audioReady) return true;
    const engine = engineRef.current;
    if (!engine) return false;
    try {
      await engine.initAudio();
      setAudioReady(true);
      return true;
    } catch {
      return false;
    }
  };

  // =========================================================================
  // FREESTYLE MODE HANDLERS
  // =========================================================================
  const handleToggleTransport = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const ok = await ensureAudioReady();
    if (!ok) return;

    if (engine.isTransportRunning()) {
      engine.stopTransport();
      setIsPlaying(false);
      setClipStatesById(new Map());
    } else {
      engine.startTransport();
      setIsPlaying(true);
    }
  };

  const handleFreestylePadClick = async (clipId) => {
    const engine = engineRef.current;
    if (!engine) return;
    const ok = await ensureAudioReady();
    if (!ok) return;

    // Auto-start transport so quantized scheduling works.
    if (!engine.isTransportRunning()) {
      engine.startTransport();
      setIsPlaying(true);
    }

    engine.triggerClip(clipId);
  };

  // =========================================================================
  // GAME MODE LOGIC
  // =========================================================================

  // Generate a new sequence for the current level
  const generateSequence = useCallback((level) => {
    const availableClips = playableClipIds.current;
    if (availableClips.length === 0) {
      console.warn('No playable clips found for game!');
      return [];
    }
    
    console.log(`Generating sequence level ${level} from ${availableClips.length} available clips`);
    
    const sequence = [];
    for (let i = 0; i < level; i++) {
      const randomClip = availableClips[Math.floor(Math.random() * availableClips.length)];
      sequence.push(randomClip);
    }
    return sequence;
  }, []);

  // Play the demonstration sequence
  const playDemoSequence = useCallback(async (sequence) => {
    const engine = engineRef.current;
    if (!engine) return;

    // Mark sequence as active
    gameAbortRef.current = false;
    setGamePhase(GamePhase.demonstrating);

    // Debug: Log the sequence and check if all clips have pads
    console.log('Demo sequence:', sequence);
    sequence.forEach(clipId => {
      const hasPad = Array.from(unifiedPads.values()).some(pad => pad.id === clipId);
      if (!hasPad) {
        console.warn(`Demo sequence contains clip ${clipId} but no pad found in grid!`);
      }
    });

    for (let i = 0; i < sequence.length; i++) {
      // Check if aborted
      if (gameAbortRef.current) {
        setGameHighlightedPads(new Set());
        return;
      }
      
      const clipId = sequence[i];
      
      // Highlight the pad
      setGameHighlightedPads(new Set([clipId]));
      
      // Play the full loop (fire-and-forget, layers on top of any playing loops)
      engine.playClipOverlay(clipId);
      
      // Keep highlight visible for a moment
      await new Promise(resolve => setTimeout(resolve, GAME_CONFIG.demoHighlightMs));
      
      // Check if aborted
      if (gameAbortRef.current) {
        setGameHighlightedPads(new Set());
        return;
      }
      
      // Clear highlight
      setGameHighlightedPads(new Set());
      
      // Gap before next note (unless last note)
      if (i < sequence.length - 1) {
        await new Promise(resolve => setTimeout(resolve, GAME_CONFIG.demoGapMs));
      }
    }

    // Check if aborted before switching to input
    if (gameAbortRef.current) return;

    // Delay then switch to input phase
    await new Promise(resolve => setTimeout(resolve, 400));
    
    if (!gameAbortRef.current) {
      setGamePhase(GamePhase.waitingForInput);
      setPlayerProgress(0);
    }
  }, []);

  // Start a new game
  const handleStartGame = useCallback(async () => {
    // Abort any running sequence
    gameAbortRef.current = true;
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const ok = await ensureAudioReady();
    if (!ok) return;

    // Stop any running transport
    const engine = engineRef.current;
    if (engine?.isTransportRunning()) {
      engine.stopTransport();
      setIsPlaying(false);
      setClipStatesById(new Map());
    }

    // Reset game state
    setGameLevel(1);
    setGameScore(0);
    setPlayerProgress(0);
    setGameFeedbackPads(new Map());
    setGameHighlightedPads(new Set());

    // Generate and play first sequence
    const sequence = generateSequence(1);
    setGameSequence(sequence);

    // Small delay then start demo
    await new Promise(resolve => setTimeout(resolve, 400));
    await playDemoSequence(sequence);
  }, [ensureAudioReady, generateSequence, playDemoSequence]);

  // Handle player input in game mode
  const handleGamePadClick = useCallback(async (clipId) => {
    // Use ref to check phase to avoid stale closure
    if (gamePhaseRef.current !== GamePhase.waitingForInput) return;

    const engine = engineRef.current;
    if (!engine) return;

    // Debug: Check if this clipId has a corresponding pad
    const hasPad = Array.from(unifiedPads.values()).some(pad => pad.id === clipId);
    if (!hasPad) {
      console.warn(`Game clicked clip ${clipId} but no pad found in grid! Available pads:`, 
        Array.from(unifiedPads.values()).map(p => p.id));
    }

    const expectedClipId = gameSequence[playerProgress];
    const isCorrect = clipId === expectedClipId;

    // Play the full loop (layers on top of any playing loops)
    engine.playClipOverlay(clipId);

    if (isCorrect) {
      // Show correct feedback
      setGameFeedbackPads(new Map([[clipId, 'correct']]));
      
      setTimeout(() => {
        setGameFeedbackPads(new Map());
      }, GAME_CONFIG.feedbackDurationMs);

      const newProgress = playerProgress + 1;
      setPlayerProgress(newProgress);

      // Check if sequence complete
      if (newProgress >= gameSequence.length) {
        // Level complete!
        setGamePhase(GamePhase.success);
        const levelScore = gameLevel * 10;
        setGameScore(prev => prev + levelScore);

        // Start next level after delay
        setTimeout(async () => {
          const nextLevel = gameLevel + 1;
          setGameLevel(nextLevel);
          setPlayerProgress(0);
          
          const newSequence = generateSequence(nextLevel);
          setGameSequence(newSequence);
          
          await playDemoSequence(newSequence);
        }, GAME_CONFIG.levelUpDelayMs);
      }
    } else {
      // Wrong! Game Over
      setGameFeedbackPads(new Map([[clipId, 'incorrect']]));
      setGamePhase(GamePhase.gameOver);

      // Save high score to Supabase if user is logged in
      if (currentUser && gameScore > 0) {
        saveHighScore(gameScore, gameLevel);
        // Trigger leaderboard refresh after a short delay to ensure the score is saved
        setTimeout(() => {
          // This will cause the Leaderboard component to refetch data
          setShowLeaderboard(false);
          setTimeout(() => setShowLeaderboard(true), 100);
        }, 500);
      }

      // Clear feedback after delay
      setTimeout(() => {
        setGameFeedbackPads(new Map());
      }, GAME_CONFIG.gameOverDelayMs);
    }
  }, [gameSequence, playerProgress, gameLevel, generateSequence, playDemoSequence]);

  // Save high score to Supabase
  const saveHighScore = useCallback(async (score, level) => {
    if (!currentUser) return;
    
    try {
      // Save to high_scores table
      const { error: highScoreError } = await supabase
        .from('high_scores')
        .insert({
          user_id: currentUser.id,
          score: score,
          level_reached: level
        });
        
      if (highScoreError) {
        console.error('Error saving high score:', highScoreError);
      }

      // Update profiles table with new high score if it's higher
      if (score > (currentUser.highScore || 0)) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            high_score: score
          })
          .eq('id', currentUser.id);
          
        if (profileError) {
          console.error('Error updating profile high score:', profileError);
        } else {
          // Update local state
          setCurrentUser(prev => ({
            ...prev,
            highScore: score
          }));
        }
      }
    } catch (err) {
      console.error('Failed to save high score:', err);
    }
  }, [currentUser]);

  // Reset game to ready state
  const handleResetGame = useCallback(() => {
    // Abort any running sequence
    gameAbortRef.current = true;
    
    setGamePhase(GamePhase.ready);
    setGameLevel(1);
    setGameScore(0);
    setGameSequence([]);
    setPlayerProgress(0);
    setGameFeedbackPads(new Map());
    setGameHighlightedPads(new Set());
  }, []);

  // Restart game immediately from level 1 (used by mobile hamburger Play Again)
  const handleRestartGame = useCallback(() => {
    handleStartGame();
  }, [handleStartGame]);

  // Handle mode change
  const handleModeChange = useCallback((mode) => {
    // Abort any running game sequence
    gameAbortRef.current = true;
    
    // Stop transport when switching modes
    const engine = engineRef.current;
    if (engine?.isTransportRunning()) {
      engine.stopTransport();
      setIsPlaying(false);
      setClipStatesById(new Map());
    }

    setAppMode(mode);
    
    if (mode === 'game') {
      setGamePhase(GamePhase.ready);
      setGameLevel(1);
      setGameScore(0);
      setGameSequence([]);
      setPlayerProgress(0);
      // Auto-show tutorial only the very first time the user enters game mode
      if (!hasSeenTutorial) {
        setShowTutorial(true);
        setHasSeenTutorial(true);
      }
    } else {
      setGamePhase(GamePhase.inactive);
    }
    
    setGameFeedbackPads(new Map());
    setGameHighlightedPads(new Set());
  }, [hasSeenTutorial]);

  // Unified pad click handler
  const handlePadClick = useCallback(async (clipId) => {
    if (appMode === 'game') {
      await handleGamePadClick(clipId);
    } else {
      await handleFreestylePadClick(clipId);
    }
  }, [appMode, handleGamePadClick, handleFreestylePadClick]);

  // Toggle recording
  const handleToggleRecord = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const currentUserId = currentUser?.id ?? currentUser?.authId ?? null;

    // Check if user is registered before allowing recording
    if (!currentUserId && !isRecording) {
      setShowRegistration(true);
      return;
    }

    if (isRecording) {
      // Stop recording and save the sequence
      const recording = engine.stopRecording();
      if (!recording || recording.events.length === 0) {
        setLastRecording(null);
        alert('No pads were recorded. Press Record, then trigger pads before stopping.');
      } else {
        setLastRecording(recording);
      }
      setIsRecording(false);
      
      // Save recording to Supabase Storage if user is logged in
      if (currentUserId && recording.events.length > 0) {
        try {
          // Try to render and upload audio, but don't fail if it doesn't work
          let audioUrl = null;
          try {
            // First, render to audio blob
            const wavBlob = await engine.renderRecordingToAudio(recording);
            
            // Create filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `${currentUserId}/${timestamp}.wav`;
            
            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('freestyle-audio')
              .upload(fileName, wavBlob, {
                contentType: 'audio/wav'
              });
              
            if (!uploadError) {
              // Get public URL
              const { data: { publicUrl } } = supabase.storage
                .from('freestyle-audio')
                .getPublicUrl(fileName);
              audioUrl = publicUrl;
            }
          } catch (audioErr) {
            // Continue without audio - we'll save just the event data
          }
          
          // Save recording metadata to database (with or without audio URL)
          const { error: dbError } = await supabase
            .from('recordings')
            .insert({
              user_id: currentUserId,
              audio_url: audioUrl, // Can be null if audio rendering failed
              title: `Recording ${new Date().toLocaleDateString()}`
            });
            
          if (dbError) {
            console.error('Error saving recording metadata:', dbError);
          } else {
            // Recording saved successfully, update total recordings count
            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                total_recordings: (currentUser.totalRecordings || 0) + 1
              })
              .eq('id', currentUserId);
              
            if (updateError) {
              console.error('Error updating total recordings:', updateError);
            } else {
              // Update local state
              setCurrentUser(prev => ({
                ...prev,
                totalRecordings: (prev.totalRecordings || 0) + 1
              }));
            }
          }
        } catch (err) {
          // Failed to save recording
        }
      }
    } else {
      // Ensure audio is ready
      const ok = await ensureAudioReady();
      if (!ok) return;

      // Start transport if not running
      if (!engine.isTransportRunning()) {
        engine.startTransport();
        setIsPlaying(true);
      }

      // Start recording
      engine.startRecording();
      setIsRecording(true);
    }
  }, [isRecording, ensureAudioReady, currentUser]);

  // Play back the last recording
  const handlePlayRecording = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !lastRecording || lastRecording.events.length === 0) return;

    const ok = await ensureAudioReady();
    if (!ok) return;

    // Stop any current transport
    if (engine.isTransportRunning()) {
      engine.stopTransport();
      setIsPlaying(false);
      setClipStatesById(new Map());
    }

    // Small delay then start
    await new Promise(resolve => setTimeout(resolve, 100));

    // Start transport
    engine.startTransport();
    setIsPlaying(true);
    setIsPlayingRecording(true);

    // Play recording
    engine.playRecording(lastRecording, (clipId) => {
      // Optional: flash the pad when it plays
      void clipId;
    });

    // Calculate total duration and stop after
    const ticksPerBeat = 480;
    const msPerTick = (60000 / lastRecording.bpm) / ticksPerBeat;
    const recordedDurationTicks = Math.max(0, Number(lastRecording.durationTicks) || 0);
    // Keep playback state active for full recorded timeline plus a short tail.
    const durationMs = (recordedDurationTicks + ticksPerBeat) * msPerTick;

    setTimeout(() => {
      setIsPlayingRecording(false);
    }, durationMs + 500);
  }, [lastRecording, ensureAudioReady]);

  // Download the recording as WAV audio
  const [isExporting, setIsExporting] = useState(false);
  
  const handleDownloadRecording = useCallback(async () => {
    if (!lastRecording || lastRecording.events.length === 0) return;
    
    const engine = engineRef.current;
    if (!engine) return;

    setIsExporting(true);

    try {
      // Render to audio
      const wavBlob = await engine.renderRecordingToAudio(lastRecording, (progress) => {
        console.log(`Rendering: ${Math.round(progress * 100)}%`);
      });

      // Download the WAV file
      const filename = `Rebeat-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.wav`;
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export audio:', err);
      alert('Failed to export audio. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [lastRecording]);

  // Clear the recording
  const handleClearRecording = useCallback(() => {
    setLastRecording(null);
  }, []);

  // Ensure empty clip states default to idle.
  useEffect(() => {
    setClipStatesById((prev) => {
      const next = new Map(prev);
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (!next.has(clip.id)) next.set(clip.id, PadState.idle);
        }
      }
      for (const clip of project.customClips) {
        if (!next.has(clip.id)) next.set(clip.id, PadState.idle);
      }
      return next;
    });
  }, [project]);

  // Determine if input should be disabled
  const disableInput = appMode === 'game' &&
    (gamePhase === GamePhase.demonstrating ||
     gamePhase === GamePhase.success ||
     gamePhase === GamePhase.gameOver);

  // Game is live (dim idle pads, pop active ones)
  const gameActive = appMode === 'game' &&
    gamePhase !== GamePhase.inactive &&
    gamePhase !== GamePhase.ready;

  return (
    <div className="lp-app">
      <TopBar
        isPlaying={isPlaying}
        onToggleTransport={handleToggleTransport}
        appMode={appMode}
        onModeChange={handleModeChange}
        gamePhase={gamePhase}
        gameLevel={gameLevel}
        gameScore={gameScore}
        onStartGame={handleStartGame}
        onResetGame={handleResetGame}
        onRestartGame={handleRestartGame}
        isRecording={isRecording}
        onToggleRecord={handleToggleRecord}
        hasRecording={!!lastRecording}
        isPlayingRecording={isPlayingRecording}
        isExporting={isExporting}
        onPlayRecording={handlePlayRecording}
        onDownloadRecording={handleDownloadRecording}
        onClearRecording={handleClearRecording}
        onShowTutorial={() => setShowTutorial(true)}
        onShowAccount={() => setShowAccount(true)}
        onToggleLeaderboard={() => setShowLeaderboard(!showLeaderboard)}
        currentUser={currentUser}
      />

      {showTutorial && (
        <TutorialModal onClose={() => {
          setShowTutorial(false);
          // If tutorial dismissed for the first time in game mode, trigger start
        }} />
      )}

      {showAccount && (
        <AccountModal
          onClose={() => setShowAccount(false)}
          currentUser={currentUser}
          initialView={showAccount === 'register' ? 'register' : null}
          onLogin={async (user) => {
            // Fetch user's profile from Supabase
            try {
              const { data: profileData, error } = await supabase
                .from('profiles')
                .select('id, username, avatar_url, high_score, total_recordings')
                .eq('id', user.authId)
                .single();
                
              if (error) {
                console.error('Error fetching profile:', error);
                // Fallback to auth user data
                setCurrentUser({
                  ...user,
                  id: user.id ?? user.authId,
                  highScore: 0,
                  totalRecordings: 0
                });
              } else {
                // Merge auth data with profile data
                setCurrentUser({
                  id: profileData.id,
                  username: profileData.username,
                  email: user.email,
                  avatarUrl: profileData.avatar_url,
                  highScore: profileData.high_score,
                  totalRecordings: profileData.total_recordings
                });
              }
            } catch (err) {
              console.error('Failed to fetch profile:', err);
              setCurrentUser({
                ...user,
                id: user.id ?? user.authId,
                highScore: 0,
                totalRecordings: 0
              });
            }
          }}
          onLogout={() => {
            setCurrentUser(null);
            setShowAccount(false);
          }}
        />
      )}

      {showRegistration && (
        <RegistrationModal
          onClose={() => setShowRegistration(false)}
          onOpenAccount={() => {
            setShowRegistration(false);
            setShowAccount(true);
          }}
          onOpenRegistration={() => {
            setShowRegistration(false);
            setShowAccount('register');
          }}
        />
      )}

      <main className="lp-main">
        <LaunchpadGrid
          title={appMode === 'game' ? `Memory Game - Level ${gameLevel}` : project.name}
          columns={project.grid.columns}
          rows={gridRows}
          pads={unifiedPads}
          onPadClick={handlePadClick}
          columnLabels={columnLabels}
          columnColors={columnColors}
          columnActivity={columnActivity}
          gameHighlightedPads={gameHighlightedPads}
          gameFeedbackPads={gameFeedbackPads}
          disableInput={disableInput}
          gameActive={gameActive}
        />
        
        {appMode === 'game' && showLeaderboard && (
          <div className="lb-mobile-overlay" onClick={() => setShowLeaderboard(false)}>
            <Leaderboard 
              isVisible={showLeaderboard} 
              currentScore={gameScore}
              currentUser={currentUser}
              onClose={() => setShowLeaderboard(false)}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
