import { useState, useRef, useEffect } from "react";
import { useStore, store } from "../../store.js";
import { actions } from "../../socket.js";
import { REACTIONS } from "../../util.js";

export default function ChatModal() {
  const chat = useStore((s) => s.chat);
  const [text, setText] = useState("");
  const listRef = useRef(null);

  const close = () => store.set({ overlay: null, unreadChat: 0 });

  // Mark read on open, and auto-scroll to the newest message.
  useEffect(() => {
    store.set({ unreadChat: 0 });
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    actions.sendChat(t);
    setText("");
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal chat-modal">
        <h2>💬 Table Chat</h2>

        <div className="reaction-row">
          {REACTIONS.map((e) => (
            <button
              key={e}
              className="reaction-btn"
              onClick={() => actions.sendReaction(e)}
              title="Send reaction"
            >
              {e}
            </button>
          ))}
        </div>

        <div className="chat-list" ref={listRef}>
          {chat.length === 0 ? (
            <div className="chat-empty">No messages yet — say hi 👋</div>
          ) : (
            chat.map((m) => (
              <div key={m.id} className={"chat-msg" + (m.mine ? " mine" : "")}>
                {!m.mine ? <span className="chat-name">{m.name}</span> : null}
                <span className="chat-text">{m.text}</span>
              </div>
            ))
          )}
        </div>

        <div className="chat-input-row">
          <input
            type="text"
            placeholder="Type a message…"
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button className="btn" onClick={send} disabled={!text.trim()}>
            Send
          </button>
        </div>
        <button className="btn block ghost" style={{ marginTop: 8 }} onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
