const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Fail gracefully if env vars are missing during build, but warn.
if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials missing. Database calls will fail.');
}

const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseKey || 'anon-key');

const db = {
    serialize: (cb) => { if (cb) cb(); },

    get: async (sql, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }

        try {
            let data, error;
            if (sql.includes('FROM users WHERE email = ?')) {
                ({ data, error } = await supabase.from('users').select('*').eq('email', params[0]).maybeSingle());
            } else if (sql.includes('FROM board_store WHERE id = 1')) {
                ({ data, error } = await supabase.from('board_store').select('data').eq('id', 1).maybeSingle());
            } else if (sql.includes('SELECT id, first_name, last_name, email, role, is_setup_complete FROM users WHERE id = ?')) {
                ({ data, error } = await supabase.from('users').select('id, first_name, last_name, email, role, is_setup_complete').eq('id', params[0]).maybeSingle());
            } else if (sql.includes('count(*) as count')) {
                const { count, error: cErr } = await supabase.from('board_store').select('*', { count: 'exact', head: true });
                data = { count: count || 0 }; error = cErr;
            } else if (sql.includes('SELECT * FROM users WHERE id = ?')) {
                ({ data, error } = await supabase.from('users').select('*').eq('id', params[0]).maybeSingle());
            } else {
                console.warn('[DB] Unknown GET query:', sql);
                return callback(new Error('Unknown query'));
            }

            if (error) {
                console.error('[DB] Supabase Error:', error);
                callback(error);
            } else {
                callback(null, data);
            }
        } catch (err) { callback(err); }
    },

    run: async (sql, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        const ctx = { lastID: 0, changes: 0 };

        try {
            let error;
            if (sql.includes('INSERT INTO users')) {
                const { data, error: err } = await supabase.from('users').insert({
                    email: params[0], password_hash: params[1], role: params[2], is_setup_complete: 0
                }).select().single();
                if (data) ctx.lastID = data.id;
                error = err;
            } else if (sql.includes('UPDATE board_store SET data = ?')) {
                const { error: err } = await supabase.from('board_store').update({ data: params[0] }).eq('id', 1);
                ctx.changes = 1; error = err;
            } else if (sql.includes('UPDATE users SET first_name = ?')) {
                const id = params[params.length - 1];
                const updates = { first_name: params[0], last_name: params[1], email: params[2], is_setup_complete: 1 };
                if (sql.includes('password_hash = ?')) updates.password_hash = params[3];
                const { error: err } = await supabase.from('users').update(updates).eq('id', id);
                ctx.changes = 1; error = err;
            } else if (sql.includes('UPDATE users SET role = ?')) {
                const { error: err } = await supabase.from('users').update({ role: params[0] }).eq('id', params[1]).neq('role', 'owner');
                ctx.changes = 1; error = err;
            } else if (sql.includes('DELETE FROM users')) {
                const { error: err } = await supabase.from('users').delete().eq('id', params[0]).neq('role', 'owner');
                ctx.changes = 1; error = err;
            } else if (sql.includes('INSERT INTO board_store')) {
                const { error: err } = await supabase.from('board_store').insert({ id: 1, data: params[0] });
                error = err;
            } else if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE')) {
                // Ignore schema changes
            } else {
                console.warn('[DB] Unknown RUN query:', sql);
            }

            if (callback) callback.call(ctx, error || null);
        } catch (e) { if (callback) callback.call(ctx, e); }
    },

    all: async (sql, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        try {
            let data, error;
            if (sql.includes('SELECT id, first_name, last_name, email, role, is_setup_complete FROM users')) {
                ({ data, error } = await supabase.from('users').select('id, first_name, last_name, email, role, is_setup_complete'));
            } else if (sql.includes('SELECT id, first_name, last_name, email FROM users')) {
                ({ data, error } = await supabase.from('users').select('id, first_name, last_name, email'));
            } else {
                console.warn('[DB] Unknown ALL query:', sql);
            }
            callback(error || null, data || []);
        } catch (e) { callback(e); }
    }
};

module.exports = db;
