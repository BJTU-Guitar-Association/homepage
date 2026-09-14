/* 图片灯箱：点击图片放大查看（双指缩放 / 拖动平移 / 左右切图 / 双击放大）
   主站与内部站共用此文件。内部站页面以相对路径引用，由外壳补全为公开站地址。 */

(function initLightbox() {
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML =
    '<div class="lightbox-spin"></div>' +
    '<button class="lightbox-nav prev" type="button" aria-label="上一张">&#8249;</button>' +
    '<div class="lightbox-stage">' +
    '  <img class="lightbox-img" src="" alt="">' +
    '</div>' +
    '<button class="lightbox-nav next" type="button" aria-label="下一张">&#8250;</button>' +
    '<div class="lightbox-top">' +
    '  <span class="lightbox-count"></span>' +
    '  <button class="lightbox-close" type="button" aria-label="关闭">&times;</button>' +
    '</div>' +
    '<div class="lightbox-cap"></div>';
  document.body.appendChild(lb);

  var img = lb.querySelector('.lightbox-img');
  var cap = lb.querySelector('.lightbox-cap');
  var count = lb.querySelector('.lightbox-count');
  var closeBtn = lb.querySelector('.lightbox-close');
  var prevBtn = lb.querySelector('.lightbox-nav.prev');
  var nextBtn = lb.querySelector('.lightbox-nav.next');

  var group = [];      // 当前组（同组图片）
  var index = 0;       // 当前序号
  var scale = 1, tx = 0, ty = 0;  // 缩放与平移

  function resetView() {
    scale = 1; tx = 0; ty = 0;
    img.style.transform = '';
  }
  function applyView() {
    img.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
  }
  function render() {
    var el = group[index];
    if (!el) return;
    resetView();
    lb.classList.add('loading');
    var src = el.getAttribute('data-full') || el.src;
    img.onload = function () { lb.classList.remove('loading'); };
    img.src = src;
    img.alt = el.getAttribute('alt') || '';
    cap.textContent = el.getAttribute('title') || el.getAttribute('alt') || '';
    count.textContent = group.length > 1 ? (index + 1) + ' / ' + group.length : '';
    prevBtn.hidden = group.length < 2;
    nextBtn.hidden = group.length < 2;
  }
  function open(el) {
    // 收集当前"章节"（最近的带 id 的容器）内的所有照片，可循环切换
    var scope = el.closest(
      'details[id], .chapter-block[id], .section-block[id], .subsection-block[id], .sub4-block[id]'
    );
    group = scope
      ? Array.prototype.slice.call(scope.querySelectorAll('img.img, .gallery img'))
      : [el];
    if (!group.length) group = [el];
    index = group.indexOf(el);
    if (index < 0) index = 0;
    render();
    lb.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lb.classList.remove('show');
    document.body.style.overflow = '';
  }
  function step(d) {
    if (group.length < 2) return;
    index = (index + d + group.length) % group.length;  // 循环切换
    render();
  }

  // 打开：点击正文图片 / 画廊缩略图
  document.addEventListener('click', function (e) {
    var el = e.target.closest('.img, .gallery img');
    if (!el || lb.classList.contains('show')) return;
    open(el);
  });

  // 缩放：以鼠标/触摸点为中心，保证指针所指内容位置不变
  // 缩放到指定倍数（px,py 为锚点，即保持该画面位置不动）
  function zoomTo(px, py, ns) {
    var rect = lb.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;   // 视口中心
    var cy = rect.top + rect.height / 2;
    var mx = px - cx;                      // 锚点相对中心
    var my = py - cy;
    ns = Math.min(5, Math.max(1, ns));
    if (ns === scale) return;
    // 保持锚点下的图像点不动：t' = m - s'·(m - t)/s
    tx = mx - ns * (mx - tx) / scale;
    ty = my - ns * (my - ty) / scale;
    scale = ns;
    clampView();
    applyView();
  }
  function zoomAt(px, py, factor) {
    zoomTo(px, py, scale * factor);
  }

  // 平移边界：图片至少覆盖整个视口，可查看每一部分但不会拖丢
  function clampView() {
    var vw = lb.clientWidth;
    var vh = lb.clientHeight;
    var w = img.clientWidth * scale;
    var h = img.clientHeight * scale;
    var maxX = Math.max(0, (w - vw) / 2);
    var maxY = Math.max(0, (h - vh) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }

  // 滚轮缩放（鼠标指针为中心）
  lb.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  // ---- 手势统一处理（触摸捏合/滑动 + 鼠标拖拽，Pointer Events）----
  var pointers = {};            // pointerId -> {x, y}
  var pinchDist0 = 0;           // 捏合初始两指距离
  var pinchScale0 = 1;          // 捏合初始 scale
  var downX = 0, downY = 0;     // 按下起点
  var dragTx0 = 0, dragTy0 = 0; // 拖动起点 translate
  var moved = false;            // 本次手势是否发生移动
  var swipeX = 0;               // 未放大时水平滑动累计
  var suppressClick = false;    // 手势结束后抑制 click（防误关）

  function pointerCount() {
    var n = 0;
    for (var k in pointers) n++;
    return n;
  }

  lb.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = pointerCount();
    if (n === 1) {
      downX = e.clientX; downY = e.clientY;
      dragTx0 = tx; dragTy0 = ty;
      moved = false; swipeX = 0;
    } else if (n === 2) {
      var ids = Object.keys(pointers);
      var p0 = pointers[ids[0]], p1 = pointers[ids[1]];
      pinchDist0 = Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      pinchScale0 = scale;
    }
  });

  lb.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    var n = pointerCount();
    if (n === 2) {
      // 双指捏合缩放：以两指中点为锚
      var ids = Object.keys(pointers);
      var p0 = pointers[ids[0]], p1 = pointers[ids[1]];
      var dist = Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      var midX = (p0.x + p1.x) / 2;
      var midY = (p0.y + p1.y) / 2;
      zoomTo(midX, midY, pinchScale0 * dist / pinchDist0);
      moved = true;
    } else if (n === 1) {
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 8) moved = true;
      if (scale > 1) {
        // 放大后：单指拖动平移
        tx = dragTx0 + (e.clientX - downX);
        ty = dragTy0 + (e.clientY - downY);
        clampView();
        applyView();
      } else {
        // 未放大：累计水平滑动（用于左右切图）
        swipeX = e.clientX - downX;
      }
    }
  });

  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    var n = pointerCount();
    if (n === 1) {
      // 双指变单指：重置拖动基准
      var ids = Object.keys(pointers);
      var p0 = pointers[ids[0]];
      downX = p0.x; downY = p0.y;
      dragTx0 = tx; dragTy0 = ty;
    } else if (n === 0) {
      // 全部抬起：若未放大且水平滑动，切换照片
      if (moved && scale <= 1 && Math.abs(swipeX) > 60) {
        suppressClick = true;
        step(swipeX < 0 ? 1 : -1);
      } else if (moved) {
        suppressClick = true;   // 拖动过，不当作点击关闭
      }
      moved = false;
    }
  }
  lb.addEventListener('pointerup', endPointer);
  lb.addEventListener('pointercancel', endPointer);

  // 关闭：点背景 / 关闭按钮 / Esc
  lb.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    if (e.target === lb || e.target === lb.querySelector('.lightbox-stage')) close();
  });
  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', function () { step(-1); });
  nextBtn.addEventListener('click', function () { step(1); });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('show')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // 双击：放大 2x / 还原
  img.addEventListener('dblclick', function (e) {
    e.preventDefault();
    if (scale > 1) resetView();
    else zoomAt(e.clientX, e.clientY, 2);
  });
})();
