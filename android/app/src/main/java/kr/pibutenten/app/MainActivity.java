package kr.pibutenten.app;

import android.os.Bundle;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 피부텐텐 네이티브 셸 액티비티.
 *
 * <p>Android 15(API 35)+ 부터 edge-to-edge 가 강제되어 (targetSdk 36) WebView 가 상태바·
 * 내비게이션 바 뒤까지 그려진다. 이 환경에서는 {@code @capacitor/status-bar} 의
 * {@code overlaysWebView:false} 설정이 무력화되어 웹 콘텐츠가 OS 상태바와 겹친다.
 *
 * <p>해결: 시스템 바(systemBars) inset 만큼 WebView 에 padding 을 직접 적용해, 웹 화면이
 * 상태바 아래·내비게이션 바 위에서 시작·종료하도록 한다. (PWA standalone 과 동일한 레이아웃)
 * inset 으로 영역이 분리되므로 WebView 내부의 {@code env(safe-area-inset-*)} 은 0 이 되어
 * 웹 쪽 하단 패딩(.tabbar 등)과 이중 계산되지 않는다.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    ViewCompat.setOnApplyWindowInsetsListener(
        getBridge().getWebView(),
        (view, windowInsets) -> {
          Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
          view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
          return windowInsets;
        });
  }
}
