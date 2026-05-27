/**
 * Agent 追踪查看器
 * 
 * 用于展示 Agent 分析页面的完整过程，包括：
 * - 执行步骤时间线
 * - 工具调用记录
 * - 读取的文件列表
 * - 统计信息
 */

class AgentTraceViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.trace = null;
    }

    /**
     * 加载并展示追踪记录
     */
    async loadTrace(traceId) {
        try {
            const response = await fetch(`/api/agent-traces/${traceId}`);
            if (!response.ok) {
                throw new Error(`Failed to load trace: ${response.statusText}`);
            }
            this.trace = await response.json();
            this.render();
        } catch (error) {
            console.error('Failed to load trace:', error);
            this.showError(error.message);
        }
    }

    /**
     * 渲染追踪视图
     */
    render() {
        if (!this.trace) {
            this.container.innerHTML = '<div class="trace-empty">暂无追踪数据</div>';
            return;
        }

        const html = `
            <div class="agent-trace">
                ${this.renderHeader()}
                ${this.renderStats()}
                ${this.renderTimeline()}
                ${this.renderFiles()}
                ${this.renderAPIs()}
            </div>
        `;

        this.container.innerHTML = html;
    }

    /**
     * 渲染头部
     */
    renderHeader() {
        const statusClass = this.trace.status === 'completed' ? 'success' : 
                           this.trace.status === 'failed' ? 'error' : 'running';
        const statusText = this.trace.status === 'completed' ? '已完成' :
                          this.trace.status === 'failed' ? '失败' : '运行中';

        return `
            <div class="trace-header">
                <div class="trace-title">
                    <h3>Agent 分析过程</h3>
                    <span class="trace-status ${statusClass}">${statusText}</span>
                </div>
                <div class="trace-meta">
                    <div class="meta-item">
                        <span class="label">追踪 ID:</span>
                        <span class="value">${this.trace.trace_id}</span>
                    </div>
                    <div class="meta-item">
                        <span class="label">页面:</span>
                        <span class="value">${this.trace.page_path}</span>
                    </div>
                    <div class="meta-item">
                        <span class="label">开始时间:</span>
                        <span class="value">${this.formatTime(this.trace.started_at)}</span>
                    </div>
                    ${this.trace.completed_at ? `
                    <div class="meta-item">
                        <span class="label">完成时间:</span>
                        <span class="value">${this.formatTime(this.trace.completed_at)}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * 渲染统计信息
     */
    renderStats() {
        return `
            <div class="trace-stats">
                <div class="stat-card">
                    <div class="stat-value">${this.trace.steps.length}</div>
                    <div class="stat-label">执行步骤</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.trace.total_tool_calls}</div>
                    <div class="stat-label">工具调用</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.trace.files_read.length}</div>
                    <div class="stat-label">文件读取</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.trace.apis_traced.length}</div>
                    <div class="stat-label">API 追踪</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.formatDuration(this.trace.total_duration_ms)}</div>
                    <div class="stat-label">总耗时</div>
                </div>
                ${this.trace.model_name ? `
                <div class="stat-card">
                    <div class="stat-value">${this.trace.model_name}</div>
                    <div class="stat-label">模型</div>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * 渲染时间线
     */
    renderTimeline() {
        return `
            <div class="trace-timeline">
                <h4>执行步骤</h4>
                <div class="timeline-container">
                    ${this.trace.steps.map((step, index) => this.renderStep(step, index)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 渲染单个步骤
     */
    renderStep(step, index) {
        const stepTypeIcons = {
            planning: '📋',
            tool_call: '🔧',
            reasoning: '🤔',
            conclusion: '✅',
            evidence: '📊'
        };

        const stepTypeLabels = {
            planning: '规划',
            tool_call: '工具调用',
            reasoning: '推理',
            conclusion: '结论',
            evidence: '证据收集'
        };

        const icon = stepTypeIcons[step.step_type] || '•';
        const label = stepTypeLabels[step.step_type] || step.step_type;

        return `
            <div class="timeline-step ${step.step_type}">
                <div class="step-marker">${icon}</div>
                <div class="step-content">
                    <div class="step-header">
                        <span class="step-number">#${step.step_number}</span>
                        <span class="step-type-label">${label}</span>
                        <span class="step-time">${this.formatTime(step.timestamp)}</span>
                    </div>
                    <div class="step-description">${step.content}</div>
                    ${step.details && Object.keys(step.details).length > 0 ? `
                    <div class="step-details">
                        ${Object.entries(step.details).map(([key, value]) => `
                            <div class="detail-item">
                                <span class="detail-key">${key}:</span>
                                <span class="detail-value">${value}</span>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}
                    ${step.tool_calls && step.tool_calls.length > 0 ? this.renderToolCalls(step.tool_calls) : ''}
                </div>
            </div>
        `;
    }

    /**
     * 渲染工具调用
     */
    renderToolCalls(toolCalls) {
        return `
            <div class="tool-calls">
                ${toolCalls.map(call => `
                    <div class="tool-call ${call.success ? 'success' : 'error'}">
                        <div class="tool-call-header">
                            <span class="tool-name">${call.tool_name}</span>
                            <span class="tool-duration">${call.duration_ms}ms</span>
                        </div>
                        ${call.result_summary ? `
                        <div class="tool-result">${call.result_summary}</div>
                        ` : ''}
                        ${call.error_message ? `
                        <div class="tool-error">${call.error_message}</div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * 渲染文件列表
     */
    renderFiles() {
        if (!this.trace.files_read || this.trace.files_read.length === 0) {
            return '';
        }

        return `
            <div class="trace-files">
                <h4>读取的文件 (${this.trace.files_read.length})</h4>
                <ul class="file-list">
                    ${this.trace.files_read.map(file => `
                        <li class="file-item">
                            <span class="file-icon">📄</span>
                            <span class="file-path">${file}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * 渲染 API 列表
     */
    renderAPIs() {
        if (!this.trace.apis_traced || this.trace.apis_traced.length === 0) {
            return '';
        }

        return `
            <div class="trace-apis">
                <h4>追踪的 API (${this.trace.apis_traced.length})</h4>
                <ul class="api-list">
                    ${this.trace.apis_traced.map(api => `
                        <li class="api-item">
                            <span class="api-icon">🔗</span>
                            <span class="api-path">${api}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * 流式展示分析过程
     */
    async streamAnalysis(config, pagePath, refresh = false) {
        this.container.innerHTML = '<div class="trace-streaming"><h3>正在分析...</h3><div class="stream-steps"></div></div>';
        const stepsContainer = this.container.querySelector('.stream-steps');

        const params = new URLSearchParams({
            page_path: pagePath,
            refresh: refresh.toString()
        });

        const eventSource = new EventSource(
            `/api/page-lineage/stream?${params.toString()}`
        );

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                switch (data.event) {
                    case 'start':
                        this.addStreamStep(stepsContainer, '🚀', data.content);
                        break;
                    case 'step':
                        this.addStreamStep(stepsContainer, '▶️', data.content);
                        break;
                    case 'tool_call':
                        this.addStreamStep(stepsContainer, '🔧', data.content);
                        break;
                    case 'complete':
                        this.addStreamStep(stepsContainer, '✅', data.content);
                        eventSource.close();
                        
                        // 加载完整追踪
                        if (data.data && data.data.trace_id) {
                            setTimeout(() => {
                                this.loadTrace(data.data.trace_id);
                            }, 1000);
                        }
                        break;
                    case 'error':
                        this.addStreamStep(stepsContainer, '❌', `错误: ${data.content}`, 'error');
                        eventSource.close();
                        break;
                }
            } catch (error) {
                console.error('Failed to parse event:', error);
            }
        };

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            this.addStreamStep(stepsContainer, '❌', '连接中断', 'error');
            eventSource.close();
        };
    }

    /**
     * 添加流式步骤
     */
    addStreamStep(container, icon, content, className = '') {
        const stepEl = document.createElement('div');
        stepEl.className = `stream-step ${className}`;
        stepEl.innerHTML = `
            <span class="stream-icon">${icon}</span>
            <span class="stream-content">${content}</span>
            <span class="stream-time">${new Date().toLocaleTimeString()}</span>
        `;
        container.appendChild(stepEl);

        // 自动滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    /**
     * 显示错误
     */
    showError(message) {
        this.container.innerHTML = `
            <div class="trace-error">
                <div class="error-icon">❌</div>
                <div class="error-message">${message}</div>
            </div>
        `;
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * 格式化时长
     */
    formatDuration(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return `${minutes}m ${seconds}s`;
        }
    }
}

// 导出到全局
window.AgentTraceViewer = AgentTraceViewer;
