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
  const db = await api.openDb('upload_quotas')
  const { getCurrentUsername } = api.require('./auth')
  return {
    async middleware(ctx) {
      const method = ctx.method.toLowerCase()
      if (method !== 'put') return
      const amount = Number(ctx.request.headers['content-length']);
      const username = getCurrentUsername(ctx)
      if (!username) {
        ctx.status = 403
        return true // deny anonymous
      }
      /**
       * @type {{username: string, megabytes: number}[]}
       */
      const conf = api.getConfig('perAccount')
      const userRule = conf.find(r => r.username === getCurrentUsername(ctx))
      if (!userRule) return // no limits for this user
      const used = Number((await db.get(username)) || 0)
      if (used + amount > userRule.megabytes) {
        ctx.status = 413
        return true
      }
      db.put(username, used + amount)
    }
  }
}
