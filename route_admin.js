const express = require('express');
const supabase = require('./db');
const { authenticate, requireAdmin, requirePermission, auditLog } = require('./middleware');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/dashboard', requirePermission('admin.dashboard.read'), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const [usersCount, newToday, activeSessions] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', today),
            supabase.from('sessions').select('id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString())
        ]);
        
        res.json({
            total_users: usersCount.count || 0,
            new_today: newToday.count || 0,
            active_sessions: activeSessions.count || 0
        });
    } catch (e) {
        res.status(500).json({ error: 'Dashboard failed' });
    }
});

router.get('/users', requirePermission('admin.users.read'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search;
        
        let query = supabase.from('users').select('*', { count: 'exact' });
        
        if (search) {
            query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%`);
        }
        
        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        
        if (error) throw error;
        
        res.json({
            users: data,
            total: count,
            page,
            pages: Math.ceil(count / limit)
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.post('/users/:id/suspend', requirePermission('admin.users.suspend'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const { data: oldUser } = await supabase.from('users').select('*').eq('id', id).single();
        if (!oldUser) return res.status(404).json({ error: 'User not found' });
        
        await supabase.from('users').update({ status: 'suspended' }).eq('id', id);
        
        await auditLog(
            req.admin.id,
            'user.suspend',
            'user',
            id,
            { status: oldUser.status },
            { status: 'suspended' },
            reason,
            req.ip
        );
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to suspend user' });
    }
});

router.get('/audit-logs', requirePermission('admin.audit.read'), async (req, res) => {
    try {
        const { data } = await supabase
            .from('audit_logs')
            .select('*, admin_users(display_name, username)')
            .order('created_at', { ascending: false })
            .limit(100);
        
        res.json({ logs: data });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
