const crypto = require('crypto');

function verifyTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;
        
        params.delete('hash');
        
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();
        
        const computedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        if (computedHash !== hash) {
            console.warn('Hash mismatch in Telegram initData');
            return null;
        }
        
        const authDate = parseInt(params.get('auth_date'));
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 86400) {
            console.warn('Telegram initData too old');
            return null;
        }
        
        const userStr = params.get('user');
        if (!userStr) return null;
        const user = JSON.parse(userStr);
        
        return { user, authDate };
    } catch (e) {
        console.error('Error verifying Telegram initData:', e);
        return null;
    }
}

module.exports = { verifyTelegramInitData };
