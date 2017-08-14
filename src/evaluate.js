import { INUMBER, IOP1, IOP2, IOP3, IVAR, IFUNCALL, IEXPR, IMEMBER } from './instruction';

export default function evaluate(tokens, expr, values) {
  var nstack = [];
  var n1, n2, n3;
  var f;
  var push = function (val) {
    return Promise.resolve(val).then(function (v) {
      nstack.push(v);
      return v;
    });
  };
  var pop = function () {
    return Promise.resolve(nstack.pop());
  };
  var reject = function (msg) {
    return Promise.reject(msg);
  };
  var processToken = function (prev, token) {
    var item = token;
    var type = item.type;
    var next;
    switch (type) {
      case INUMBER:
        next = push.bind(push, item.value);
        break;
      case IOP2:
        next = function () {
          n2 = pop();
          n1 = pop();
          f = expr.binaryOps[item.value];
          return Promise.all([n1, n2]).then(function (res) {
            return push(f(res[0], res[1]));
          });
        };
        break;
      case IOP3:
        next = function () {
          n3 = pop();
          n2 = pop();
          n1 = pop();
          f = expr.binaryOps[item.value];
          return Promise.all([n1, n2, n3]).then(function (res) {
            n1 = res[0];
            n2 = res[1];
            n3 = res[2];
            if (item.value === '?') {
              return push(n1 ? n2 : n3, expr, values);
            }
            f = expr.ternaryOps[item.value];
            return push(f(n1, n2, n3));
          });
        };
        break;
      case IVAR:
        next = function () {
          if (item.value in expr.functions) {
            return push(expr.functions[item.value]);
          } else {
            var v = values[item.value];
            if (v !== undefined) {
              return push(v);
            } else {
              return reject(reject, 'undefined variable: ' + item.value);
            }
          }
        };
        break;
      case IOP1:
        next = function () {
          n1 = pop();
          f = expr.unaryOps[item.value];
          return n1.then(f).then(push);
        };
        break;
      case IFUNCALL:
        next = function () {
          var argCount = item.value;
          var args = [];
          while (argCount-- > 0) {
            args.unshift(pop());
          }
          f = pop();
          return f.then(function (func) {
            return Promise.all(args).then(function (args) {
              if (func.apply && func.call) {
                return push(func.apply(undefined, args));
              } else {
                return reject(f + ' is not a function');
              }
            });
          });
        };
        break;
      case IEXPR:
        next = push.bind(push, item.value);
        break;
      case IMEMBER:
        next = function () {
          n1 = pop();
          return n1.then(function (n1) {
            return n1[item.value];
          });
        };
        break;
      default:
        next = reject.bind(reject, 'invalid Expression');
        break;
    }
    return prev.then(next);
  };
  return tokens.reduce(processToken, Promise.resolve()).then(function () {
    if (nstack.length > 1) {
      return reject('invalid Expression (parity)');
    }
    return nstack[0];
  });
}
