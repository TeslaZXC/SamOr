import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { WS_URL } from '../config';

import { DiffieHellman } from '../crypto/dh';
import { MTProtoCrypto } from '../crypto/mtproto';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const [status, setStatus] = useState('disconnected'); // disconnected, handshaking, connected
    const [messages, setMessages] = useState([]);
    const [dialogs, setDialogs] = useState([]);
    const [contacts, setContacts] = useState([]);
    const socketRef = useRef(null);
    const dhRef = useRef(new DiffieHellman());
    const authKeyRef = useRef(null);
    const sessionIdRef = useRef(null);

    useEffect(() => {
        // Connect to WebSocket
        // Connect to WebSocket
        const wsUrl = WS_URL;

        console.log('Connecting to WebSocket at:', wsUrl);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WS Connected');
            setStatus('handshaking');

            // 1. Send Client Hello
            const clientPubKey = dhRef.current.getPublicKey();
            ws.send(JSON.stringify({
                type: 'client_hello',
                payload: {
                    public_key: clientPubKey
                }
            }));
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'server_hello') {
                // 2. Receive Server Hello
                const serverPubKey = data.payload.public_key;
                sessionIdRef.current = data.payload.session_id;

                // Compute Auth Key
                const authKey = dhRef.current.computeSharedSecret(serverPubKey);
                authKeyRef.current = authKey;

                console.log('Handshake Complete. AuthKey derived.');
                setStatus('connected');

            } else if (data.data) {
                // Encrypted Message
                if (!authKeyRef.current) return;

                try {
                    const encryptedBytes = new Uint8Array(data.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                    const decrypted = MTProtoCrypto.decrypt(authKeyRef.current, encryptedBytes);

                    // Decode UTF8
                    const decoder = new TextDecoder();
                    const jsonStr = decoder.decode(decrypted);
                    const message = JSON.parse(jsonStr);

                    console.log('Decrypted Message:', message);

                    // Handle dialogs.list and user.list_result in context
                    if (message.type === 'dialogs.list') {
                        // Filter out dialogs with invalid peer data
                        const validDialogs = (message.dialogs || []).filter(d => {
                            if (!d.peer || !d.peer.display_name) {
                                console.warn('DEBUG: Filtering out invalid dialog', d);
                                return false;
                            }
                            return true;
                        });
                        setDialogs(validDialogs);
                    } else if (message.type === 'user.list_result') {
                        // Filter out users without display_name
                        const validUsers = (message.users || []).filter(u => {
                            if (!u.display_name) {
                                console.warn('DEBUG: Filtering out invalid user', u);
                                return false;
                            }
                            return true;
                        });
                        setContacts(validUsers);
                    }

                    if (message.type === 'auth_success') {
                        // We let the component handle the state update via messages or callback
                        // We push it to messages so App/Login can see it
                    }

                    setMessages(prev => [...prev, message]);
                } catch (err) {
                    console.error('Decryption failed', err);
                }
            }
        };

        ws.onclose = () => {
            console.log('WS Disconnected');
            setStatus('disconnected');
        };

        socketRef.current = ws;

        return () => {
            ws.close();
        };
    }, []);

    const sendMessage = (payload) => {
        console.log("DEBUG: sendMessage called with:", payload);
        if (status !== 'connected' || !authKeyRef.current) {
            console.warn('Cannot send: Not connected securely. Status:', status);
            return;
        }

        try {
            const jsonStr = JSON.stringify(payload);
            const encoder = new TextEncoder();
            const bytes = encoder.encode(jsonStr);

            // Encrypt
            const encrypted = MTProtoCrypto.encrypt(authKeyRef.current, bytes);

            // Send as hex string in JSON wrapper
            const hex = Array.from(encrypted).map(b => b.toString(16).padStart(2, '0')).join('');

            socketRef.current.send(JSON.stringify({
                data: hex
            }));
        } catch (err) {
            console.error('Encryption failed', err);
        }
    };

    return (
        <SocketContext.Provider value={{ status, messages, sendMessage, dialogs, contacts, setDialogs, setContacts }}>
            {children}
        </SocketContext.Provider>
    );
};
