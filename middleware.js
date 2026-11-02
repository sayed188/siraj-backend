const jwt = require('jsonwebtoken');
const supabase = require('./db');

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing auth token' });
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.type === 'admin') {
            const { data: admin } = await supabase
                .from('admin_users')
                .select('*, roles(name)')
                .eq('id', decoded.id)
                .eq('status', 'active')
                .single();
            
            if (!admin) return res.status(401).json({ error: 'Admin not found or inactive' });
            req.admin = admin;
            req.userType = 'admin';
        } else {
            const { data: user } = await supabase
                .from('users')
                .select('*')
                .eq('id', decoded.id)
                .eq('status', 'active')
                .single();
            
            if (!user) return res.status(401).json({ error: 'User not found or inactive' });
            req.user = user;
            req.userType = 'user';
        }
        
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.userType !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

function requirePermission(permissionKey) {
    return async (req, res, next) => {
        if (!req.admin) return res.status(403).json({ error: 'Admin access required' });
        
        const { data } = await supabase
            .from('role_permissions')
            .select('permissions!inner(key)')
            .eq('role_id', req.admin.role_id)
            .eq('permissions.key', permissionKey)
            .single();
        
        if (!data) {
            return res.status(403).json({ error: `Permission denied: ${permissionKey}` });
        }
        next();
    };
}

async function auditLog(adminId, action, resourceType, resourceId, oldValue, newValue, reason, ip) {
    await supabase.from('audit_logs').insert({
        admin_id: adminId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        old_value: oldValue,
        new_value: newValue,
        reason,
        ip_address: ip
    });
}

module.exports = { authenticate, requireAdmin, requirePermission, auditLog };
