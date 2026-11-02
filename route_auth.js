const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('./db');
const { verifyTelegramInitData } = require('./telegram_auth');

const router = express.Router();

router.post('/telegram', async (req, res) => {
    try {
        const { initData, botType = 'student' } = req.body;
        
        if (!initData) {
            return res.status(400).json({ error: 'initData is required' });
        }
        
        const botToken = botType === 'admin' 
            ? process.env.ADMIN_BOT_TOKEN 
            : process.env.STUDENT_BOT_TOKEN;
        
        const verified = verifyTelegramInitData(initData, botToken);
        if (!verified) {
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        const { user: tgUser } = verified;
        
        if (botType === 'admin') {
            const { data: admin } = await supabase
                .from('admin_users')
                .select('*')
                .eq('telegram_id', tgUser.id)
                .eq('status', 'active')
                .single();
            
            if (!admin) {
                return res.status(403).json({ error: 'Not authorized as admin' });
            }
            
            await supabase.from('admin_users').update({
                last_login_at: new Date().toISOString(),
                last_ip: req.ip
            }).eq('id', admin.id);
            
            const token = jwt.sign(
                { id: admin.id, type: 'admin', role_id: admin.role_id },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );
            
            return res.json({ token, admin });
        } else {
            let { data: user } = await supabase
                .from('users')
                .select('*')
                .eq('telegram_id', tgUser.id)
                .single();
            
            if (!user) {
                const { data: newUser, error } = await supabase
                    .from('users')
                    .insert({
                        telegram_id: tgUser.id,
                        username: tgUser.username,
                        first_name: tgUser.first_name,
                        last_name: tgUser.last_name,
                        language_code: tgUser.language_code
                    })
                    .select()
                    .single();
                
                if (error) throw error;
                user = newUser;
            } else {
                await supabase.from('users').update({
                    last_seen_at: new Date().toISOString()
                }).eq('id', user.id);
            }
            
            const token = jwt.sign(
                { id: user.id, type: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );
            
            return res.json({ token, user });
        }
    } catch (e) {
        console.error('Auth error:', e);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

module.exports = router;
