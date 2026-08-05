/* ===========================================================
   Mobil tarayıcı "uzun ekran / buton görünmüyor" sorununun çözümü
   ---------------------------------------------------------------
   Android Chrome ve iOS Safari'de adres çubuğu açılıp kapandıkça
   100vh değeri değişir; bu da tasarımın taşmasına ve alt sekme /
   gönder butonu gibi öğelerin ekran dışına kaymasına sebep olur.
   Burada gerçek pencere yüksekliğini --vh değişkenine yazıyoruz
   ve CSS bunu kullanıyor. Ayrıca modern tarayıcılarda zaten
   100dvh birimini kullanıyoruz (style.css içinde), bu script
   eski tarayıcılar için ek güvence sağlıyor.
   =========================================================== */
(function () {
  function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
  window.addEventListener('orientationchange', () => {
    // Döndürme sonrası tarayıcının boyutu güncellemesi için kısa gecikme
    setTimeout(setViewportHeight, 150);
  });

  // Klavye açıldığında input'un görünür kalması için input'a odaklanınca kaydır
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      setTimeout(() => {
        e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 300);
    }
  });
})();
