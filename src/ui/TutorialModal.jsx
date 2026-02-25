import React from 'react';
import { FaEye, FaMusic, FaTrophy, FaGamepad } from 'react-icons/fa';

const STEPS = [
  {
    num: 1,
    Icon: FaEye,
    title: 'Memorize',
    desc: 'Watch the pads light up in sequence. The glow shows you which sounds to remember.',
  },
  {
    num: 2,
    Icon: FaMusic,
    title: 'Repeat',
    desc: 'Click the pads in the exact same order. Each level adds one more step to the sequence.',
  },
  {
    num: 3,
    Icon: FaTrophy,
    title: 'Win',
    desc: 'Nail the full sequence to advance to the next level and earn points!',
  },
];

export function TutorialModal({ onClose }) {
  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tm-header">
          <span className="tm-header__icon"><FaGamepad /></span>
          <h2 className="tm-title">How to Play</h2>
          <p className="tm-subtitle">Memory Game — learn the sequence, beat every level</p>
        </div>

        {/* Steps */}
        <div className="tm-steps">
          {STEPS.map((step) => (
            <div key={step.num} className="tm-step">
              <div className="tm-step__num">{step.num}</div>
              <div className="tm-step__icon"><step.Icon /></div>
              <div className="tm-step__body">
                <div className="tm-step__title">{step.title}</div>
                <div className="tm-step__desc">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tip */}
        <div className="tm-tip">
          <span className="tm-tip__label">TIP</span>
          <span>
            When a pad glows{' '}
            <span className="tm-tip__blue">blue</span>
            , that&apos;s the demo. When it&apos;s{' '}
            <span className="tm-tip__green">green</span>
            , you got it right.{' '}
            <span className="tm-tip__red">Red</span>
            &nbsp;means game over — try again!
          </span>
        </div>

        {/* CTA */}
        <button className="tm-cta" type="button" onClick={onClose}>
          Got it, Let&apos;s Play!
        </button>
      </div>
    </div>
  );
}
