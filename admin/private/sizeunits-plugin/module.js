System.register(['@grafana/data'], function (exports) {
  let AppPlugin, getValueFormatterIndex;
  return {
    setters: [function (data) { AppPlugin = data.AppPlugin; getValueFormatterIndex = data.getValueFormatterIndex; }],
    execute: function () {
      const number = new Intl.NumberFormat('de-DE', {maximumFractionDigits: 2});
      getValueFormatterIndex()['garagebytes'] = function (value) {
        if (value == null || !Number.isFinite(Number(value))) return {text: ''};
        const gb = Math.abs(Number(value)) >= 1000000000;
        return {text: number.format(Number(value) / (gb ? 1000000000 : 1000000)), suffix: gb ? ' GB' : ' MB'};
      };
      exports('plugin', new AppPlugin());
    }
  };
});
