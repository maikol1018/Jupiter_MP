import { Component } from 'react';
import './app.scss';
import { reportVisit } from './services/apiService';

class App extends Component {
  componentDidMount() {
    // 上报一次访问，结果挂到 globalData，供任意页面读取
    reportVisit()
      .then(stats => {
        const app: any = (typeof getApp === 'function' ? getApp() : null) || {};
        app.globalData = app.globalData || {};
        app.globalData.visitStats = stats;
      })
      .catch(() => {
        /* 上报失败不影响使用 */
      });
  }
  componentDidShow() {}
  componentDidHide() {}
  render() {
    return this.props.children;
  }
}

export default App;
