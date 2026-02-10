import React from 'react';

const GroupCallBanner = ({ participants = [], onJoin, onLeave, isInCall, currentUserId }) => {
    const participantCount = participants.length;

    return (
        <div style={{
            backgroundColor: '#2a2f3a',
            borderBottom: '1px solid #3a3f4a',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            animation: 'slideDown 0.3s ease-out'
        }}>
            {/* Left side: Call indicator and participants */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Animated call indicator */}
                <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#4ade80',
                    animation: 'pulse 2s infinite',
                    boxShadow: '0 0 8px rgba(74, 222, 128, 0.6)'
                }} />

                {/* Participants */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Avatar stack */}
                    <div style={{ display: 'flex', marginRight: '8px' }}>
                        {participants.slice(0, 3).map((participant, index) => (
                            <div
                                key={participant.id}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: '#4a5568',
                                    backgroundImage: participant.avatar_url ? `url(${participant.avatar_url})` : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    border: '2px solid #2a2f3a',
                                    marginLeft: index > 0 ? '-8px' : '0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    zIndex: 3 - index
                                }}
                                title={participant.display_name}
                            >
                                {!participant.avatar_url && participant.display_name?.charAt(0).toUpperCase()}
                            </div>
                        ))}
                        {participantCount > 3 && (
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: '#4a5568',
                                border: '2px solid #2a2f3a',
                                marginLeft: '-8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: 'bold'
                            }}>
                                +{participantCount - 3}
                            </div>
                        )}
                    </div>

                    {/* Call text */}
                    <div>
                        <div style={{
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            marginBottom: '2px'
                        }}>
                            Активный звонок
                        </div>
                        <div style={{
                            color: '#9ca3af',
                            fontSize: '12px'
                        }}>
                            {participantCount === 0 ? 'Никого в звонке' :
                                participantCount === 1 ? '1 участник' :
                                    participantCount < 5 ? `${participantCount} участника` :
                                        `${participantCount} участников`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right side: Join/Leave button */}
            <button
                onClick={isInCall ? onLeave : onJoin}
                style={{
                    backgroundColor: isInCall ? '#ef4444' : '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.backgroundColor = isInCall ? '#dc2626' : '#059669';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.backgroundColor = isInCall ? '#ef4444' : '#10b981';
                }}
            >
                {isInCall ? (
                    <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        Покинуть
                    </>
                ) : (
                    <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                        </svg>
                        Присоединиться
                    </>
                )}
            </button>

            {/* CSS Animations */}
            <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }
      `}</style>
        </div>
    );
};

export default GroupCallBanner;
