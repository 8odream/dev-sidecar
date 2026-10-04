const pluginConfig = require('./config')

const Plugin = function (context) {
  const { config, shell, event, log } = context
  const pluginApi = {
    async start () {
      const ip = '127.0.0.1'
      const port = config.get().server.port
      await pluginApi.setProxy(ip, port)
      return { ip, port }
    },

    async close () {
      return pluginApi.unsetProxy()
    },

    async restart () {
      await pluginApi.close()
      await pluginApi.start()
    },

    isEnabled () {
      return config.get().plugin.git.enabled
    },

    async save (newConfig) {
    },

    async setProxy (ip, port) {
      const cmds = [
        `git config --global http.proxy  http://${ip}:${port - 1} `,
        `git config --global https.proxy http://${ip}:${port} `,
      ]

      // 每次启动都显式同步 Git 的校验状态，避免只在首次勾选时写入配置。
      // sslVerify 这个界面字段表示“关闭 sslVerify”，所以勾选时 Git 值应为 false。
      const sslVerify = config.get().plugin.git.setting.sslVerify === true ? 'false' : 'true'
      cmds.push(`git config --global http.sslVerify ${sslVerify} `)

      if (config.get().plugin.git.setting.noProxyUrls != null) {
        for (const url in config.get().plugin.git.setting.noProxyUrls) {
          cmds.push(`git config --global http."${url}".proxy "" `)
        }
      }

      const ret = await shell.exec(cmds, { type: 'cmd' })
      event.fire('status', { key: 'plugin.git.enabled', value: true })
      log.info('开启【Git】代理成功')

      return ret
    },

    // 当手动修改过 `~/.gitconfig` 时，`unset` 可能会执行失败，所以除了第一条命令外，其他命令都添加了try-catch，防止关闭Git代理失败
    async unsetProxy () {
      const ret = await shell.exec(['git config --global --unset http.proxy '], { type: 'cmd' })

      try {
        await shell.exec(['git config --global --unset https.proxy '], { type: 'cmd' })
      } catch {
      }

      try {
        await shell.exec(['git config --global --unset http.sslVerify '], { type: 'cmd' })
      } catch {
      }

      if (config.get().plugin.git.setting.noProxyUrls != null) {
        for (const url in config.get().plugin.git.setting.noProxyUrls) {
          try {
            await shell.exec([`git config --global --unset http."${url}".proxy `], { type: 'cmd' })
          } catch {
          }
        }
      }
      event.fire('status', { key: 'plugin.git.enabled', value: false })
      log.info('关闭【Git】代理成功')
      return ret
    },
  }
  return pluginApi
}

module.exports = {
  key: 'git',
  config: pluginConfig,
  status: {
    enabled: false,
  },
  plugin: Plugin,
}
