"use client";

import { useState } from "react";

export default function FacebookConnect() {
  const [copied, setCopied] = useState(false);

  const command = `FB_VIDEO_URL="https://facebook.com/YourPage/videos/123" npm start`;

  function handleCopy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        <h2 className="font-bold text-gray-800">Facebook Live Comments</h2>
      </div>
      <p className="text-sm text-gray-500 mb-3">
        Run the scraper in a separate terminal to capture comments from your live stream.
        A browser window will open — log in once, and it remembers your session.
      </p>
      <div className="relative">
        <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded overflow-x-auto">
          <code>{`cd scraper\n${command}`}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="mt-3 text-xs text-gray-400 space-y-1">
        <p>Comments matching <code className="bg-gray-100 text-gray-600 px-1 rounded">&lt;code&gt; &lt;phone&gt;</code> are auto-forwarded as orders.</p>
        <p>Example: viewer comments <code className="bg-gray-100 text-gray-600 px-1 rounded">42 09012345678</code> → order created for product with claim code 42.</p>
      </div>
    </div>
  );
}
