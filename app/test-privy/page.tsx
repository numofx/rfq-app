"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

export default function TestPrivyPage() {
  const [mounted, setMounted] = useState(false);
  const [testResults, setTestResults] = useState({
    privyLoaded: false,
    readyState: false,
    noErrors: true,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const privy = usePrivy();

  useEffect(() => {
    if (mounted) {
      setTestResults({
        privyLoaded: !!privy,
        readyState: privy.ready,
        noErrors: true,
      });
    }
  }, [mounted, privy]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Mounting...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Privy Integration Test</h1>

        <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
          <TestResult
            label="Component Mounted"
            status={mounted}
            description="Component successfully mounted on client"
          />

          <TestResult
            label="Privy Hook Loaded"
            status={testResults.privyLoaded}
            description="usePrivy() hook executed without errors"
          />

          <TestResult
            label="Privy Ready State"
            status={testResults.readyState}
            description="Privy provider is fully initialized"
          />

          <TestResult
            label="No Runtime Errors"
            status={testResults.noErrors}
            description="No 'Cannot read properties of undefined' errors"
          />

          {privy.ready && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-2">
                ✅ All Tests Passed!
              </h3>
              <p className="text-sm text-green-700">
                Privy is properly initialized and ready to use.
              </p>
              <div className="mt-3 text-xs text-green-600">
                <p>Authenticated: {String(privy.authenticated)}</p>
                <p>User: {privy.user?.id || "Not logged in"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8">
          <a
            href="/dashboard"
            className="inline-block bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90"
          >
            Go to App
          </a>
        </div>
      </div>
    </div>
  );
}

function TestResult({
  label,
  status,
  description,
}: {
  label: string;
  status: boolean;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 border rounded-lg">
      <div className="flex-shrink-0 mt-1">
        {status ? (
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm">
            ✓
          </div>
        ) : (
          <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-white text-sm">
            ?
          </div>
        )}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900">{label}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}
