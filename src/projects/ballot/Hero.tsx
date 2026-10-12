import { GOVBOT_ASSETS } from './GovbotChrome';

/** govbot's Illinois State Capitol with the state flag waving on its pole. */
export function Capitol() {
  return (
    <div className="kyb-capitol" aria-hidden="true">
      <img src={`${GOVBOT_ASSETS}il-capitol-building.png`} width={1093} height={890} alt="" />
      <div className="kyb-flag">
        <svg viewBox="0 0 150 112" xmlns="http://www.w3.org/2000/svg">
          <g className="kyb-wave">
            <path d="M2 7 C 40 1 60 13 90 7 C 120 1 141 11 148 7 L148 95 C 141 99 120 90 90 96 C 60 102 40 92 2 98 Z" fill="#F6F7F8" stroke="#CBD2DC" strokeWidth="1.2" />
            <g transform="translate(66 46)">
              <ellipse cx="0" cy="-2" rx="16" ry="12" fill="none" stroke="#2F5FA6" strokeWidth="1.3" />
              <path d="M-9 0 Q0 -13 9 0 Q0 -4 -9 0 Z" fill="#7a5a2a" />
              <circle cx="10" cy="-4" r="4.2" fill="#E6B800" opacity="0.9" />
              <rect x="-4" y="1" width="8" height="6" rx="1" fill="#B4442E" />
            </g>
            <text x="66" y="84" fontFamily="Georgia, serif" fontSize="11" fontWeight="700" textAnchor="middle" fill="#2F5FA6">ILLINOIS</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
