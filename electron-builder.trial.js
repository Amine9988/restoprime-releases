'use strict';
// إعداد بناء النسخة التجريبية: نفس الكود، لكن باسم/معرّف مختلف وقناة تحديث منفصلة (trial.yml)
const base = require('./package.json').build;

module.exports = {
  ...base,
  appId: 'com.restoprime.app.trial',
  productName: 'RestoPrime Trial',
  directories: { ...base.directories, output: 'dist-trial' },
  extraMetadata: { trial: true, trialDays: 15 },
  win: { ...base.win, artifactName: 'RestoPrime-Trial-Setup-${version}.${ext}' },
  nsis: { ...base.nsis, shortcutName: 'RestoPrime Trial' },
  publish: { ...base.publish, channel: 'trial' },
};
