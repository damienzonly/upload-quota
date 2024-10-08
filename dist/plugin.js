exports.version = 1.2
exports.description = "Limits users upload size"
exports.apiRequired = 8.85
exports.repo = "damienzonly/upload-quota"

exports.config = {
  defaultQuota: {
    type: 'number',
    min: 1,
    label: "Quota applied to all accounts (MB)",
    helperText: "if not set, no limitation is applied"
  },
  perAccount: {
    type: 'array',
    fields: {
      username: { type: 'username' },
      megabytes: { type: 'number', defaultValue: 100 },
    },
    min: 1,
    helperText: "This overrides the default quota for specified accounts",
    label: "Specify the upload quota per account"
  }
}

const mb = v => v * 1024 * 1024

exports.init = async api => {
  const fs = api.require('fs/promises')
  const db = await api.openDb('upload_quotas')
  const { getCurrentUsername } = api.require('./auth')

  const unsub = api.events.multi({
    uploadStart({ctx}) {
      const amount = Number(ctx.request.headers['content-length']);
      const username = getCurrentUsername(ctx)
      if (!username) return // ignoring anonymous
      /**
       * @type {{username: string, megabytes: number}[]}
       */
      const conf = api.getConfig('perAccount')
      let userRule = (conf || []).find(r => r.username === getCurrentUsername(ctx))
      if (!userRule){
        // check default quota
        const megabytes = api.getConfig('defaultQuota')
        if (!conf) return // no limits
        userRule = {username, megabytes}
      }
      const used = Number(db.getSync(username) || 0)
      if (used + amount > mb(userRule.megabytes)) {
        ctx.status = 413
        return api.events.stop
      }
      return () => {
        db.put(username, used + amount)
      }
    },
    async deleting({ctx, node}) {
      const username = getCurrentUsername(ctx)
      if (!username) return
      try {
        const amount = (await fs.stat(node.source)).size
        const used = Number(db.getSync(username) || 0)
        const diff = used - amount
        db.put(username, diff < 0 ? 0 : diff)
      } catch (e) { 
        return
       }
    }
  })
  return {
    unload: unsub
  }
}
