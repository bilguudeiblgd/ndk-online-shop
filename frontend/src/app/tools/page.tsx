"use client";

import AppShell from "@/components/AppShell";
import ExcelFilter from "@/components/ExcelFilter";

export default function ToolsPage() {
  return (
    <AppShell>
      <div className="px-8 py-6">
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-gray-900">Гүйлгээ шүүгч</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Банкны гүйлгээг бүтээгдэхүүний үнээр шүүх
          </p>
        </div>
        <div className="max-w-2xl">
          <ExcelFilter />
        </div>
      </div>
    </AppShell>
  );
}
