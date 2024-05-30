exports.version = 1
exports.description = "Limits users upload size"
exports.apiRequired = 8.81
exports.repo = "damienzonly/user-max-upload"

exports.config = {
  perAccount: {
    type: 'array',
    fields: {
      username: { type: 'username' },
      megabytes: { type: 'number', defaultValue: 100 },
    },
    min: 1,
    label: "Decide upload quota per account"
  },
}

const mb = v => v * 1024 * 1024

exports.init = async api => {
  const fs = api.require('fs')
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
      const userRule = conf.find(r => r.username === getCurrentUsername(ctx))
      if (!userRule) return // no limits for this user
      const used = Number(db.getSync(username) || 0)
      if (used + amount > mb(userRule.megabytes)) {
        ctx.status = 413
        return false
      }
      return () => {
        db.put(username, used + amount)
      }
    },
    deleting({ctx, node}) {
      const amount = fs.statSync(node.source).size
      const username = getCurrentUsername(ctx)
      if (!username) return
      const used = Number(db.getSync(username) || 0)
      const diff = used - amount
      db.put(username, diff < 0 ? 0 : diff)
    }
  })
  return {
    unload: unsub
  }
}
