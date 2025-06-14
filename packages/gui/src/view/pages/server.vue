<script>
import _ from 'lodash'
import VueJsonEditor from 'vue-json-editor-fix-cn'
import Plugin from '../mixins/plugin'
import MockInput from '@/view/components/mock-input.vue'

export default {
  name: 'Server',
  components: {
    VueJsonEditor,
    MockInput,
  },
  mixins: [Plugin],
  data () {
    return {
      key: 'server',
      activeTabKey: '1',
      dnsMappings: [],
      speedTestList: [],
      whiteList: [],
      whiteListOptions: [
        {
          label: '不代理',
          value: 'true',
        },
        {
          label: '代理',
          value: 'false',
        },
      ],
    }
  },
  computed: {
    speedDnsOptions () {
      const options = []
      if (!this.config || !this.config.server || !this.config.server.dns || !this.config.server.dns.providers) {
        return options
      }
      _.forEach(this.config.server.dns.providers, (dnsConfig, key) => {
        options.push({
          value: key,
          label: key,
        })
      })
      return options
    },
  },
  created () {
  },
  mounted () {
    this.registerSpeedTestEvent()
  },
  methods: {
    async onCrtSelect () {
      const value = await this.$api.fileSelector.open(this.config.server.setting.rootCaFile.certPath, 'file')
      if (value != null && value.length > 0) {
        this.config.server.setting.rootCaFile.certPath = value[0]
      }
    },
    async onKeySelect () {
      const value = await this.$api.fileSelector.open(this.config.server.setting.rootCaFile.keyPath, 'file')
      if (value != null && value.length > 0) {
        this.config.server.setting.rootCaFile.keyPath = value[0]
      }
    },
    ready () {
      this.initDnsMapping()
      this.initWhiteList()
      if (this.config.server.dns.speedTest.dnsProviders) {
        this.speedDns = this.config.server.dns.speedTest.dnsProviders
      }
    },
    async applyBefore () {
      this.submitDnsMappings()
      this.submitWhiteList()
      this.delEmptySpeedHostname()
    },
    async applyAfter () {
      if (this.status.server.enabled) {
        return this.$api.server.restart()
      }
    },
    // dnsMapping
    initDnsMapping () {
      this.dnsMappings = []
      for (const key in this.config.server.dns.mapping) {
        const value = this.config.server.dns.mapping[key]
        this.dnsMappings.push({
          key,
          value,
        })
      }
    },
    submitDnsMappings () {
      const dnsMapping = {}
      for (const item of this.dnsMappings) {
        if (item.key) {
          const hostname = this.handleHostname(item.key)
          if (hostname) {
            dnsMapping[hostname] = item.value
          }
        }
      }
      this.config.server.dns.mapping = dnsMapping
    },
    deleteDnsMapping (item, index) {
      this.dnsMappings.splice(index, 1)
    },
    addDnsMapping () {
      this.dnsMappings.unshift({ key: '', value: 'quad9' })
    },

    // whiteList
    initWhiteList () {
      this.whiteList = []
      for (const key in this.config.server.whiteList) {
        const value = this.config.server.whiteList[key]
        this.whiteList.push({
          key: key || '',
          value: value === true ? 'true' : 'false',
        })
      }
    },
    addWhiteList () {
      this.whiteList.unshift({ key: '', value: 'true' })
    },
    deleteWhiteList (item, index) {
      this.whiteList.splice(index, 1)
    },
    submitWhiteList () {
      const whiteList = {}
      for (const item of this.whiteList) {
        if (item.key) {
          const hostname = this.handleHostname(item.key)
          if (hostname) {
            whiteList[hostname] = (item.value === 'true')
          }
        }
      }
      this.config.server.whiteList = whiteList
    },
    getSpeedTestConfig () {
      return this.config.server.dns.speedTest
    },
    addSpeedHostname () {
      this.getSpeedTestConfig().hostnameList.unshift('')
    },
    delSpeedHostname (item, index) {
      this.getSpeedTestConfig().hostnameList.splice(index, 1)
    },
    delEmptySpeedHostname () {
      for (let i = this.getSpeedTestConfig().hostnameList.length - 1; i >= 0; i--) {
        const hostname = this.handleHostname(this.getSpeedTestConfig().hostnameList[i])
        if (!hostname) {
          this.getSpeedTestConfig().hostnameList.splice(i, 1)
        }
      }
    },
    reSpeedTest () {
      this.$api.server.reSpeedTest()
    },
    registerSpeedTestEvent () {
      const listener = async (event, message) => {
        if (message.key === 'getList') {
          // 数据验证和标准化
          const validatedData = {}
          for (const hostname in message.value) {
            const item = message.value[hostname]
            if (!item.backupList) {
              console.warn(`Missing backupList for ${hostname}`)
              continue
            }

            validatedData[hostname] = {
              alive: item.alive || [],
              backupList: item.backupList.map(ipObj => {
                // 标准化IP地址格式
                const standardized = {
                  host: ipObj.host,
                  port: ipObj.port || 443,
                  dns: ipObj.dns || 'unknown',
                  time: ipObj.time || null
                }
                return standardized
              })
            }
          }

          this.speedTestList = validatedData
        }
      }
      this.$api.ipc.on('speed', listener)
      const interval = this.startSpeedRefreshInterval()
      this.reloadAllSpeedTester()

      this.$once('hook:beforeDestroy', () => {
        clearInterval(interval)
        this.$api.ipc.removeAllListeners('speed')
      })
    },
    async reloadAllSpeedTester () {
      this.$api.server.getSpeedTestList()
    },
    startSpeedRefreshInterval () {
      return setInterval(() => {
        this.reloadAllSpeedTester()
      }, 5000)
    },
    async handleTabChange (key) {
      this.activeTabKey = key
      if (key !== '2' && key !== '3' && key !== '5' && key !== '6' && key !== '7') {
        // 没有 JsonEditor，启用SearchBar
        window.config.disableSearchBar = false
      } else {
        // 有 JsonEditor，禁用SearchBar
        window.config.disableSearchBar = true
      }
    },
  },
}
</script>

<template>
  <ds-container>
    <template slot="header">
      加速服务设置
    </template>

    <div style="height: 100%" class="json-wrapper">
      <a-tabs
        v-if="config"
        :default-active-key="activeTabKey"
        tab-position="left"
        :style="{ height: '100%' }"
        @change="handleTabChange"
      >
        <a-tab-pane key="1" tab="基本设置">
          <div v-if="activeTabKey === '1'" style="padding-right:10px">
            <a-form-item label="代理服务:" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-checkbox v-model="config.server.enabled">
                随应用启动
              </a-checkbox>
              <a-tag v-if="status.server.enabled" color="green">
                当前已启动
              </a-tag>
              <a-tag v-else color="red">
                当前未启动
              </a-tag>
            </a-form-item>
            <a-form-item label="绑定IP" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-input v-model="config.server.host" spellcheck="false" />
              <div class="form-help">
                你可以设置为<code>0.0.0.0</code>，让其他电脑可以使用此代理服务
              </div>
            </a-form-item>
            <a-form-item label="代理端口" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-input-number v-model="config.server.port" :min="0" :max="65535" :precision="0" spellcheck="false" />
              <div class="form-help">
                修改后需要重启应用
              </div>
            </a-form-item>
            <hr>
            <a-form-item label="全局校验SSL" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-checkbox v-model="config.server.setting.NODE_TLS_REJECT_UNAUTHORIZED">
                NODE_TLS_REJECT_UNAUTHORIZED
              </a-checkbox>
              <div class="form-help">
                高风险操作，没有特殊情况请勿关闭
              </div>
            </a-form-item>
            <a-form-item label="代理校验SSL" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-checkbox v-model="config.server.setting.verifySsl">
                校验加速目标网站的ssl证书
              </a-checkbox>
              <div class="form-help">
                如果目标网站证书有问题，但你想强行访问，可以临时关闭此项
              </div>
            </a-form-item>
            <a-form-item label="根证书" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-input-search
                v-model="config.server.setting.rootCaFile.certPath" addon-before="Cert" enter-button="选择"
                :title="config.server.setting.rootCaFile.certPath" spellcheck="false"
                @search="onCrtSelect"
              />
              <a-input-search
                v-model="config.server.setting.rootCaFile.keyPath" addon-before="Key" enter-button="选择"
                :title="config.server.setting.rootCaFile.keyPath" spellcheck="false"
                @search="onKeySelect"
              />
            </a-form-item>
            <hr>
            <a-form-item label="启用拦截" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-checkbox v-model="config.server.intercept.enabled">
                启用拦截
              </a-checkbox>
              <div class="form-help">
                关闭拦截，且关闭增强功能时，就不需要安装根证书，退化为安全模式
              </div>
            </a-form-item>
            <a-form-item label="启用脚本" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-checkbox v-model="config.server.setting.script.enabled">
                允许插入并运行脚本
              </a-checkbox>
              <div class="form-help">
                关闭后，<code>Github油猴脚本</code>也将关闭
              </div>
            </a-form-item>
          </div>
        </a-tab-pane>
        <a-tab-pane key="2" tab="拦截设置">
          <div v-if="activeTabKey === '2'" style="height:100%">
            <VueJsonEditor
              v-model="config.server.intercepts" style="height:100%" mode="code"
              :show-btns="false" :expanded-on-start="true"
            />
          </div>
        </a-tab-pane>
        <a-tab-pane key="3" tab="超时时间设置">
          <div v-if="activeTabKey === '3'" style="height:100%;display:flex;flex-direction:column">
            <a-form-item label="默认超时时间" :label-col="labelCol" :wrapper-col="wrapperCol">
              请求：<a-input-number v-model="config.server.setting.defaultTimeout" :step="1000" :min="1000" :precision="0" spellcheck="false" /> ms，对应<code>timeout</code>配置<br>
              连接：<a-input-number v-model="config.server.setting.defaultKeepAliveTimeout" :step="1000" :min="1000" :precision="0" spellcheck="false" /> ms，对应<code>keepAliveTimeout</code>配置
            </a-form-item>
            <hr style="margin-bottom:15px">
            <div>这里指定域名的超时时间：<span class="form-help">（域名配置可使用通配符或正则）</span></div>
            <VueJsonEditor
              v-model="config.server.setting.timeoutMapping" style="flex-grow:1;min-height:300px;margin-top:10px" mode="code"
              :show-btns="false" :expanded-on-start="true"
            />
          </div>
        </a-tab-pane>
        <a-tab-pane key="4" tab="域名白名单">
          <div v-if="activeTabKey === '4'">
            <a-row style="margin-top:10px">
              <a-col span="21">
                <div>这里配置的域名不会通过代理</div>
              </a-col>
              <a-col span="3">
                <a-button style="margin-left:8px" type="primary" icon="plus" @click="addWhiteList()" />
              </a-col>
            </a-row>
            <a-row v-for="(item, index) of whiteList" :key="index" :gutter="10" style="margin-top: 5px">
              <a-col :span="16">
                <MockInput v-model="item.key" />
              </a-col>
              <a-col :span="5">
                <a-select v-model="item.value" style="width:100%">
                  <a-select-option v-for="(item2) of whiteListOptions" :key="item2.value" :value="item2.value">
                    {{ item2.label }}
                  </a-select-option>
                </a-select>
              </a-col>
              <a-col :span="3">
                <a-button type="danger" icon="minus" @click="deleteWhiteList(item, index)" />
              </a-col>
            </a-row>
          </div>
        </a-tab-pane>
        <a-tab-pane key="5" tab="自动兼容程序">
          <div v-if="activeTabKey === '5'" style="height:100%;display:flex;flex-direction:column">
            <div>
              说明：<code>自动兼容程序</code>会自动根据错误信息进行兼容性调整，并将兼容设置保存在 <code>~/.dev-sidecar/automaticCompatibleConfig.json</code> 文件中。但并不是所有的兼容设置都是正确的，所以需要通过以下配置来覆盖错误的兼容设置。
            </div>
            <VueJsonEditor
              v-model="config.server.compatible" style="flex-grow:1;min-height:300px;margin-top:10px;" mode="code"
              :show-btns="false" :expanded-on-start="true"
            />
          </div>
        </a-tab-pane>
        <a-tab-pane key="6" tab="IP预设置">
          <div v-if="activeTabKey === '6'" style="height:100%;display:flex;flex-direction:column">
            <div>
              提示：<code>IP预设置</code>功能，优先级高于 <code>DNS设置</code>
              <span class="form-help">（域名配置可使用通配符或正则）</span>
            </div>
            <VueJsonEditor
              v-model="config.server.preSetIpList" style="flex-grow:1;min-height:300px;margin-top:10px;" mode="code"
              :show-btns="false" :expanded-on-start="true"
            />
          </div>
        </a-tab-pane>
        <a-tab-pane key="7" tab="DNS服务管理">
          <div v-if="activeTabKey === '7'" style="height:100%">
            <VueJsonEditor
              v-model="config.server.dns.providers" style="height:100%" mode="code"
              :show-btns="false" :expanded-on-start="true"
            />
          </div>
        </a-tab-pane>
        <a-tab-pane key="8" tab="DNS设置">
          <div v-if="activeTabKey === '8'">
            <a-row style="margin-top:10px">
              <a-col span="21">
                <div>这里配置哪些域名需要通过国外DNS服务器获取IP进行访问</div>
              </a-col>
              <a-col span="3">
                <a-button style="margin-left:8px" type="primary" icon="plus" @click="addDnsMapping()" />
              </a-col>
            </a-row>
            <a-row v-for="(item, index) of dnsMappings" :key="index" :gutter="10" style="margin-top: 5px">
              <a-col :span="15">
                <MockInput v-model="item.key" />
              </a-col>
              <a-col :span="6">
                <a-select v-model="item.value" :disabled="item.value === false" style="width: 100%">
                  <a-select-option v-for="(item) of speedDnsOptions" :key="item.value" :value="item.value">
                    {{ item.value }}
                  </a-select-option>
                </a-select>
              </a-col>
              <a-col :span="3">
                <a-button type="danger" icon="minus" @click="deleteDnsMapping(item, index)" />
              </a-col>
            </a-row>
          </div>
        </a-tab-pane>
        <a-tab-pane key="9" tab="IP测速">
          <div v-if="activeTabKey === '9'" class="ip-tester" style="padding-right: 10px">
            <a-alert type="info" message="对从DNS获取到的IP进行测速，使用速度最快的IP进行访问（注意：对使用了增强功能的域名没啥用）" />
            <a-form-item label="开启DNS测速" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-checkbox v-model="getSpeedTestConfig().enabled">
                启用
              </a-checkbox>
            </a-form-item>
            <a-form-item label="自动测试间隔" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-input-number v-model="getSpeedTestConfig().interval" :step="1000" :min="1" :precision="0" spellcheck="false" /> ms
            </a-form-item>
            <!-- <a-form-item label="慢速IP阈值" :label-col="labelCol" :wrapper-col="wrapperCol">
              <a-input-number v-model="config.server.setting.lowSpeedDelay" :step="10" :min="100" :precision="0" spellcheck="false" /> ms
            </a-form-item> -->
            <div>使用以下DNS获取IP进行测速</div>
            <a-row style="margin-top:10px">
              <a-col span="24">
                <a-checkbox-group
                  v-model="getSpeedTestConfig().dnsProviders"
                  :options="speedDnsOptions"
                />
              </a-col>
            </a-row>
            <a-row :gutter="10" class="mt20">
              <a-col :span="21">
                以下域名在启动后立即进行测速，其他域名在第一次访问时才测速
              </a-col>
              <a-col :span="2">
                <a-button style="margin-left:10px" type="primary" icon="plus" @click="addSpeedHostname()" />
              </a-col>
            </a-row>
            <a-row v-for="(item, index) of getSpeedTestConfig().hostnameList" :key="index" :gutter="10" style="margin-top: 5px">
              <a-col :span="21">
                <MockInput v-model="getSpeedTestConfig().hostnameList[index]" />
              </a-col>
              <a-col :span="2">
                <a-button style="margin-left:10px" type="danger" icon="minus" @click="delSpeedHostname(item, index)" />
              </a-col>
            </a-row>

            <a-divider />
            <a-row :gutter="10" class="mt10">
              <a-col span="24">
                <a-button type="primary" icon="plus" @click="reSpeedTest()">
                  立即重新测速
                </a-button>
                <a-button class="ml10" type="primary" icon="reload" @click="reloadAllSpeedTester()">
                  刷新
                </a-button>
              </a-col>
            </a-row>

            <a-row :gutter="20">
              <a-col v-for="(item, key) of speedTestList" :key="key" span="12">
                <a-card size="small" class="mt10" :title="key">
                  <a slot="extra" href="javascript:void(0)" :title="key" style="cursor:default">
                    <a-icon v-if="item.alive.length > 0" type="check" />
                    <a-icon v-else type="info-circle" />
                  </a>
                  <a-tag
                    v-for="(element, index) of item.backupList" :key="index" style="margin:2px;"
                    :title="element.dns" :color="element.time ? (element.time > config.server.setting.lowSpeedDelay ? 'orange' : 'green') : 'red'"
                    :class="{'ipv6-tag': element.host.includes(':')}"
                  >
                    {{ element.host }} {{ element.time }}{{ element.time ? 'ms' : '' }} {{ element.dns }}
                    <span v-if="element.host.includes(':')" class="ipv6-badge">IPv6</span>
                  </a-tag>
                </a-card>
              </a-col>
            </a-row>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
    <template slot="footer">
      <div class="footer-bar">
        <a-button :loading="resetDefaultLoading" class="mr10" icon="sync" @click="resetDefault()">
          恢复默认
        </a-button>
        <a-button :loading="applyLoading" icon="check" type="primary" @click="apply()">
          应用
        </a-button>
      </div>
    </template>
  </ds-container>
</template>

<style lang="scss">
.json-wrapper {
  .ant-drawer-wrapper-body {
    display: flex;
    flex-direction: column;

    .ant-drawer-body {
      flex: 1;
      height: 0;
    }
  }

  .jsoneditor-vue {
    height: 100%;
  }

  .ant-tabs {
    height: 100%;
  }

  .ant-tabs-content {
    height: 100%;
  }

  .ant-tabs-tabpane-active {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .ant-input-group-addon:first-child {
    width: 45px;
  }
}
.ipv6-tag {
  position: relative;
  padding-right: 45px !important;
  margin-right: 5px !important;
  display: inline-flex !important;
  align-items: center !important;
  min-width: 200px !important;
}
.ipv6-badge {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  background: #1890ff;
  color: white;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 16px;
  height: 16px;
}
.ip-box {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background-color: #fafafa;
  border-radius: 4px;
  margin-top: 8px;
  max-width: 100%;
  overflow: hidden;
}
.ip-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background-color: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
  word-break: break-all;
  max-width: calc(100% - 16px);
  flex: 1 1 auto;
  min-width: 0;
}
.ip-item .ip-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ip-item .ip-speed {
  margin-left: 8px;
  white-space: nowrap;
}
.ip-item .ip-speed.success {
  color: #52c41a;
}
.ip-item .ip-speed.warning {
  color: #faad14;
}
.ip-item .ip-speed.error {
  color: #ff4d4f;
}
.domain-box {
  margin-bottom: 16px;
  padding: 12px;
  background-color: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.domain-box .domain-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.domain-box .domain-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.domain-box .domain-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  flex-shrink: 0;
}
</style>
