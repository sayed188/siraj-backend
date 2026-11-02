const express = require('express');
const supabase = require('./db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const [{ data: configs }, { data: flags }] = await Promise.all([
            supabase.from('remote_config').select('key, value'),
            supabase.from('feature_flags').select('key, is_enabled, rollout_percentage')
        ]);
        
        const config = {};
        (configs || []).forEach(c => { config[c.key] = c.value; });
        
        const features = {};
        (flags || []).forEach(f => { 
            features[f.key] = { 
                enabled: f.is_enabled, 
                rollout: f.rollout_percentage 
            }; 
        });
        
        res.json({ config, features });
    } catch (e) {
        console.error('Config error:', e);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

module.exports = router;
