import express from 'express';
import { dbManager } from '../database/connection.js';

const router = express.Router();

router.get('/catalog/job/:id', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const job = await db.get(`SELECT * FROM catalog_jobs WHERE id = ?`, req.params.id);
    await dbManager.close();
    
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    let previewData: any[] = [];
    let headers: string[] = [];
    let suggestedMapping = {};
    
    if (job.extracted_data) {
      try {
        const extracted = JSON.parse(job.extracted_data);
        if (extracted.previewData) previewData = extracted.previewData;
        if (extracted.headers) headers = extracted.headers;
        if (extracted.suggestedMapping) suggestedMapping = extracted.suggestedMapping;
      } catch (e) {
        console.error('Failed to parse extracted_data JSON', e);
      }
    }
    
    res.json({ 
      success: true, 
      jobId: job.id, 
      status: job.status,
      totalCount: job.total_count || 0,
      existingCount: job.existing_count || 0,
      newCount: job.new_count || 0,
      duplicateCount: job.duplicate_count || 0,
      progress: job.progress || 0,
      processedCount: job.processed_count || 0,
      errorLog: job.error_log || null,
      original_filename: job.original_filename,
      extractedData: job.extracted_data ? JSON.parse(job.extracted_data) : [],
      previewData,
      headers,
      suggestedMapping
    });
  } catch (error) {
    console.error('Fetch job error:', error);
    res.status(500).json({ error: 'Internal server error fetching job' });
  }
});

// Pause a catalog ingestion job
router.post('/catalog/job/:id/pause', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const db = await dbManager.getConnection();
    const job = await db.get('SELECT * FROM catalog_jobs WHERE id = ?', jobId);
    
    if (!job) {
      await dbManager.close();
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'processing') {
      await dbManager.close();
      return res.status(400).json({ error: 'Only actively processing jobs can be paused' });
    }

    await db.run("UPDATE catalog_jobs SET status = 'paused' WHERE id = ?", jobId);
    await dbManager.close();

    const { eventService } = await import('../services/eventService.js');
    eventService.broadcast('catalog_job_update', { 
      id: jobId, 
      status: 'paused', 
      progress: job.progress || 0,
      total_count: job.total_count || 0,
      new_count: job.new_count || 0,
      existing_count: job.existing_count || 0,
      duplicate_count: job.duplicate_count || 0
    });

    res.json({ success: true, message: 'Ingestion paused' });
  } catch (error) {
    console.error('Pause job error:', error);
    res.status(500).json({ error: 'Internal server error pausing job' });
  }
});

// Resume a catalog ingestion job
router.post('/catalog/job/:id/resume', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const db = await dbManager.getConnection();
    const job = await db.get('SELECT * FROM catalog_jobs WHERE id = ?', jobId);
    
    if (!job) {
      await dbManager.close();
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'paused') {
      await dbManager.close();
      return res.status(400).json({ error: 'Only paused jobs can be resumed' });
    }

    await db.run("UPDATE catalog_jobs SET status = 'pending' WHERE id = ?", jobId);
    await dbManager.close();

    const { eventService } = await import('../services/eventService.js');
    eventService.broadcast('catalog_job_update', { 
      id: jobId, 
      status: 'pending', 
      progress: job.progress || 0,
      total_count: job.total_count || 0,
      new_count: job.new_count || 0,
      existing_count: job.existing_count || 0,
      duplicate_count: job.duplicate_count || 0
    });

    import('../worker/catalogWorker.js')
      .then(({ runCatalogImport }) => {
        runCatalogImport(jobId).catch(err => console.error('Resumed background catalog import failed:', err));
      })
      .catch(err => console.error('Failed to load runCatalogImport from worker:', err));

    res.json({ success: true, message: 'Ingestion resumed' });
  } catch (error) {
    console.error('Resume job error:', error);
    res.status(500).json({ error: 'Internal server error resuming job' });
  }
});

// Trigger Catalogue Background Import Job with customized mappings
router.post('/catalog/import-job/:id', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const { mappings, filters } = req.body;

    if (!mappings || typeof mappings !== 'object') {
      return res.status(400).json({ error: 'Invalid or missing mappings configuration' });
    }

    const db = await dbManager.getConnection();
    const job = await db.get('SELECT * FROM catalog_jobs WHERE id = ?', jobId);
    
    if (!job) {
      await dbManager.close();
      return res.status(404).json({ error: 'Job not found' });
    }

    // Save mappings to catalog_mappings for smart learning
    const headers = Object.keys(mappings);
    const headerKey = headers.slice().sort().join(',');
    try {
      await db.run(
        'INSERT OR REPLACE INTO catalog_mappings (file_headers, mapping_json) VALUES (?, ?)',
        [headerKey, JSON.stringify(mappings)]
      );
    } catch (learnErr) {
      console.warn('Smart learning mapping save failed:', learnErr);
    }

    // Set status to pending and save mapping config on the job
    await db.run(
      'UPDATE catalog_jobs SET mapping_config = ?, data_filters = ?, status = "pending", progress = 0, processed_count = 0, new_count = 0, existing_count = 0, duplicate_count = 0 WHERE id = ?',
      [JSON.stringify(mappings), JSON.stringify(filters || {}), jobId]
    );
    await dbManager.close();

    // Start background import worker process asynchronously
    import('../worker/catalogWorker.js')
      .then(({ runCatalogImport }) => {
        runCatalogImport(jobId).catch(err => console.error('Background catalog import failed:', err));
      })
      .catch(err => console.error('Failed to load runCatalogImport from worker:', err));

    res.json({ success: true, message: 'Import started in the background' });
  } catch (error) {
    console.error('Import job trigger error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New Catalog Import Endpoint (Receives confirmed preview data)
router.post('/catalog/import', async (req, res) => {
  const { medicines } = req.body;
  if (!Array.isArray(medicines)) {
    return res.status(400).json({ error: 'Invalid payload, expected array of medicines' });
  }
  
  try {
    const db = await dbManager.getConnection();
    
    for (const med of medicines) {
      if (!med.name) continue;
      
      const existing = await db.get(`SELECT id FROM medicines WHERE lower(name) = lower(?)`, med.name);
      if (existing) {
        const updates = [];
        const params = [];
        
        if (med.manufacturer) { updates.push("manufacturer = COALESCE(NULLIF(manufacturer, ''), ?)"); params.push(med.manufacturer); }
        if (med.marketed_by) { updates.push("marketed_by = COALESCE(NULLIF(marketed_by, ''), ?)"); params.push(med.marketed_by); }
        if (med.api_reference) { updates.push("api_reference = COALESCE(NULLIF(api_reference, ''), ?)"); params.push(med.api_reference); }
        if (med.strength) { updates.push("strength = COALESCE(NULLIF(strength, ''), ?)"); params.push(med.strength); }
        if (med.packaging_type) { updates.push("packaging = COALESCE(NULLIF(packaging, ''), ?)"); params.push(med.packaging_type); }
        
        if (updates.length > 0) {
            params.push(existing.id);
            const setClause = updates.join(', ');
            await db.run(`UPDATE medicines SET ${setClause} WHERE id = ?`, ...params);
        }
      } else {
        await db.run(
          `INSERT INTO medicines (name, api_reference, strength, packaging, manufacturer, marketed_by) VALUES (?, ?, ?, ?, ?, ?)`,
          med.name,
          med.api_reference || null,
          med.strength || null,
          med.packaging_type || null,
          med.manufacturer || null,
          med.marketed_by || null
        );
      }
    }
    
    await dbManager.close();
    res.json({ success: true, message: 'Catalog imported successfully' });
  } catch (error) {
    await dbManager.close();
    console.error('Import error:', error);
    res.status(500).json({ error: 'Internal server error during import' });
  }
});

// API to fetch all catalog jobs
router.get('/jobs', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const jobs = await db.all('SELECT * FROM catalog_jobs ORDER BY created_at DESC');
    await dbManager.close();
    res.json(jobs);
  } catch (error) {
    await dbManager.close();
    console.error('Failed to fetch jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
