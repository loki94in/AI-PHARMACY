import React, { useState } from 'react';
import { Database, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

const CatalogUpload = () => {
  return (
    <div className="h-full flex flex-col fade-in relative">
      <div className="glass-panel flex-1 flex flex-col overflow-hidden m-6 rounded-xl border border-glass-border">
        {/* Header Section */}
        <div className="p-6 border-b border-glass-border flex flex-col gap-3 bg-white/5">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h3 className="font-bold flex items-center gap-2 text-2xl text-white">
                <Database size={24} className="text-primary" /> 
                Catalog Upload
              </h3>
              <p className="text-gray-400 text-sm mt-1">Upload and manage product catalogs</p>
              
              {/* Feature Badges */}
              <div className="flex gap-2 text-[10px] flex-wrap mt-3 max-w-4xl">
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ CSV Upload</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Excel Upload</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Bulk Product Import</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Product Validation</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Duplicate Detection</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Category Mapping</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Price Updates</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Bulk Product Updates</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Import History</span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Error Reports</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center text-center">
          <div className="bg-white/5 border border-dashed border-glass-border rounded-xl p-12 max-w-lg w-full">
            <Upload size={48} className="mx-auto text-gray-500 mb-4" />
            <h4 className="text-lg font-semibold text-white mb-2">Upload Catalog CSV/Excel</h4>
            <p className="text-gray-400 text-sm mb-6">Drag and drop your file here, or click to browse.</p>
            <button className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
              Select File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogUpload;
