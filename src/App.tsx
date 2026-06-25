/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { useAppStore } from "./store";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { SubjectView } from "./components/SubjectView";
import { DocumentView } from "./components/DocumentView";
import { ChapterView } from "./components/ChapterView";
import { Loader2 } from "lucide-react";

export default function App() {
  const { isInitialized, initialize, activeSubject, activeDocument, activeChapter } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
         <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <Layout>
       {!activeSubject && <Dashboard />}
       {activeSubject && !activeDocument && <SubjectView />}
       {activeDocument && !activeChapter && <DocumentView />}
       {activeChapter && <ChapterView />}
    </Layout>
  );
}

