package kr.pibutenten.app;

import com.getcapacitor.BridgeActivity;

/**
 * 피부텐텐 네이티브 셸 액티비티.
 *
 * <p>상태바·내비게이션 바 inset 처리는 Capacitor 코어의 {@code SystemBars} 플러그인이 담당한다.
 * Android 15(API 35, VANILLA_ICE_CREAM)+ 의 강제 edge-to-edge 환경에서 SystemBars 는
 * WebView 의 부모(CoordinatorLayout)에 systemBars inset 만큼 padding 을 적용하고,
 * onPageCommitVisible 시점에 {@code requestApplyInsets()} 로 리스너를 발동시킨다.
 *
 * <p>여기서 별도 {@code OnApplyWindowInsetsListener} 를 등록하면 SystemBars 의 리스너를
 * 덮어써(뷰당 리스너는 1개) inset 처리가 무효화되므로, 커스텀 코드를 두지 않는다.
 * 상태바 표시·색은 {@code capacitor.config.ts} 의 StatusBar 플러그인 설정으로 제어한다.
 */
public class MainActivity extends BridgeActivity {}
