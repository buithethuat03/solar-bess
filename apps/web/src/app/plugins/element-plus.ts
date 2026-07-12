import type { App } from 'vue';
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput } from 'element-plus';
import 'element-plus/es/components/alert/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/form/style/css';
import 'element-plus/es/components/form-item/style/css';
import 'element-plus/es/components/input/style/css';

export function installElementPlus(app: App): void {
  for (const component of [ElAlert, ElButton, ElForm, ElFormItem, ElInput]) {
    app.component(component.name!, component);
  }
}
