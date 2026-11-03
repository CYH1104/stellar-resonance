// 粒子水印：鼠标靠近时粒子散开，离开后回弹
(function(){
  var cv=$c('ic'),ctx=cv.getContext('2d'),card=document.getElementById('card'),ps=[],m={x:-1e3,y:-1e3,r:200},STEP=2;
  function $c(i){return document.getElementById(i)}
  function grad(){var g=ctx.createLinearGradient(-100,-100,100,220);g.addColorStop(0,'#d3e0f0');g.addColorStop(.5,'#c0d2e8');g.addColorStop(1,'#adc3de');return g}
  function base(){
    ctx.save();ctx.scale(2,2);ctx.translate(190,150);
    var g=grad();ctx.strokeStyle=g;ctx.fillStyle=g;ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();ctx.lineWidth=3;ctx.arc(0,0,95,0,7);ctx.stroke();
    ctx.beginPath();ctx.lineWidth=1.5;ctx.arc(0,0,86,0,7);ctx.stroke();
    ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(-22,48);ctx.lineTo(-22,-28);ctx.lineTo(-8,-64);ctx.lineTo(6,-48);ctx.lineTo(6,48);
    ctx.moveTo(-8,-64);ctx.lineTo(-8,-76);
    ctx.moveTo(10,48);ctx.lineTo(10,-22);ctx.quadraticCurveTo(44,-16,48,14);ctx.lineTo(48,48);
    ctx.moveTo(-60,48);ctx.lineTo(-60,20);ctx.lineTo(-26,2);
    ctx.moveTo(52,48);ctx.lineTo(52,26);ctx.lineTo(66,34);ctx.lineTo(66,48);
    ctx.moveTo(-66,48);ctx.lineTo(68,48);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();
    for(var fy=-20;fy<=40;fy+=12){ctx.moveTo(-18,fy);ctx.lineTo(2,fy)}
    for(fy=0;fy<=40;fy+=10){ctx.moveTo(14,fy);ctx.lineTo(44,fy)}
    ctx.stroke();
    ctx.save();ctx.rotate(-Math.PI/9);ctx.beginPath();ctx.lineWidth=2;ctx.ellipse(0,0,125,36,0,0,7);ctx.stroke();ctx.restore();
    [[-55,-48],[58,-50],[-45,58],[52,55],[0,70]].forEach(function(p){ctx.beginPath();ctx.arc(p[0],p[1],2,0,7);ctx.fill()});
    ctx.textAlign='center';ctx.textBaseline='middle';
    var t='STELLAR ACADEMY';ctx.font='bold 40px "Helvetica Neue",Arial,sans-serif';
    var sx=Math.min(1,350/ctx.measureText(t).width);
    ctx.save();ctx.scale(sx,1);ctx.fillText(t,0,140);ctx.restore();
    ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-150,173);ctx.lineTo(-95,173);ctx.moveTo(95,173);ctx.lineTo(150,173);ctx.stroke();
    ctx.font='14px "Helvetica Neue",Arial,sans-serif';ctx.fillText('INTERSTELLAR  INSTITUTE',0,173);
    ctx.restore();
  }
  function P(x,y,c){this.ox=x;this.oy=y;this.x=x;this.y=y;this.c=c;this.vx=0;this.vy=0}
  P.prototype.update=function(){
    var dx=m.x-this.x,dy=m.y-this.y,d=Math.hypot(dx,dy);
    if(d<m.r){var a=Math.atan2(dy,dx),f=(m.r-d)/m.r*7;this.vx-=Math.cos(a)*f+(Math.random()-.5)*.6;this.vy-=Math.sin(a)*f+(Math.random()-.5)*.6}
    this.vx=(this.vx+(this.ox-this.x)*.03)*.85;this.vy=(this.vy+(this.oy-this.y)*.03)*.85;
    this.x+=this.vx;this.y+=this.vy;
  };
  P.prototype.draw=function(){
    ctx.fillStyle=this.c;var d=Math.hypot(this.x-this.ox,this.y-this.oy);
    if(d<.5)ctx.fillRect(this.ox,this.oy,STEP,STEP);else{var s=Math.min(5,STEP+d*.2);ctx.fillRect(this.x,this.y,s,s)}
  };
  base();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var D=ctx.getImageData(0,0,cv.width,cv.height).data;ctx.clearRect(0,0,cv.width,cv.height);
  for(var y=0;y<cv.height;y+=STEP)for(var x=0;x<cv.width;x+=STEP){
    var r=0,g=0,b=0,sa=0,n=0;
    for(var yy=y;yy<y+STEP;yy++)for(var xx=x;xx<x+STEP;xx++){var i=(yy*cv.width+xx)*4,a=D[i+3];r+=D[i]*a;g+=D[i+1]*a;b+=D[i+2]*a;sa+=a;n++}
    var al=sa/n;
    if(al>4)ps.push(new P(x,y,'rgba('+Math.round(r/sa)+','+Math.round(g/sa)+','+Math.round(b/sa)+','+(al/255).toFixed(3)+')'));
  }
  var ang=0;
  (function loop(){
    ctx.clearRect(0,0,cv.width,cv.height);
    for(var k=0;k<ps.length;k++){ps[k].update();ps[k].draw()}
    ctx.save();ctx.scale(2,2);ctx.translate(190,150);ctx.fillStyle=grad();ctx.rotate(-Math.PI/9);
    ctx.beginPath();ctx.arc(125*Math.cos(ang),36*Math.sin(ang),6,0,7);ctx.fill();ctx.restore();
    ang+=.008;requestAnimationFrame(loop);
  })();
  function pos(cx,cy){var b=cv.getBoundingClientRect();m.x=(cx-b.left)*cv.width/b.width;m.y=(cy-b.top)*cv.height/b.height}
  function off(){m.x=-1e3;m.y=-1e3}
  card.addEventListener('mousemove',function(e){pos(e.clientX,e.clientY)});
  card.addEventListener('mouseleave',off);
  card.addEventListener('touchmove',function(e){pos(e.touches[0].clientX,e.touches[0].clientY)},{passive:true});
  card.addEventListener('touchend',off);
})();
// 纸飞机：始终飞向鼠标
(function(){
  var p=document.getElementById('plane');if(matchMedia('(prefers-reduced-motion: reduce)').matches){p.hidden=true;return;}var x=60,y=60,vx=0,vy=0,tx=60,ty=60,a=0;
  function mv(e){tx=e.clientX;ty=e.clientY}
  addEventListener('pointermove',mv);addEventListener('pointerdown',mv);
  (function f(){
    vx=(vx+(tx-x)*.0035)*.95;vy=(vy+(ty-y)*.0035)*.95;x+=vx;y+=vy;
    if(Math.hypot(vx,vy)>.4){var d=Math.atan2(vy,vx)-a;a+=Math.atan2(Math.sin(d),Math.cos(d))*.12}
    p.style.transform='translate('+x+'px,'+y+'px) rotate('+a+'rad)';
    requestAnimationFrame(f);
  })();
})();
