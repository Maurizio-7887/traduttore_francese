package it.mauriziogusti.interpreteduo;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle state) {
        registerPlugin(InterpreterPlugin.class);
        super.onCreate(state);
    }
}
