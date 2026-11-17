import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useEstilos } from '@/components/ui/kit';
import type { Cores } from '@/constants/mycash';
import { criarUseEstilos } from '@/lib/estilos';
import { useTema } from '@/lib/tema';
import { VERSAO_DO_APP } from '@/lib/api';
import { decidirAtualizacao, type DecisaoDeAtualizacao } from '@dominio/versao';

/**
 * Comunica incompatibilidade de versao entre o aplicativo e a API.
 *
 * Dois comportamentos, conforme a gravidade:
 *
 * - **Aviso dispensavel**: existe versao mais nova, mas a atual ainda e
 *   atendida. Uma faixa no topo que o usuario fecha e segue usando.
 * - **Bloqueio**: a versao instalada esta abaixo da minima suportada. Tela
 *   modal sem botao de dispensa, porque seguir dali so levaria a telas
 *   quebradas — e foi isso que aconteceu em 28/08, quando o aplicativo
 *   esperava um campo que a API ainda nao servia.
 *
 * A decisao usa `decidirAtualizacao` de src/domain, a mesma funcao que o
 * servidor usa para decidir se recusa a requisicao. Duas implementacoes da
 * mesma regra divergiriam, e divergir aqui significa bloquear quem podia usar
 * ou liberar quem vai ver tela quebrada.
 */

type Politica = {
  maisRecente: string;
  minimaSuportada: string;
  loja: { android: string; ios: string };
};

const ENDERECO = process.env.EXPO_PUBLIC_API_URL ?? 'https://mycash-nu.vercel.app';

export default function AvisoDeVersao() {
  const ui = useEstilos();
  const proprios = useProprios();
  const { cores } = useTema();

  const [decisao, setDecisao] = useState<DecisaoDeAtualizacao>('em-dia');
  const [politica, setPolitica] = useState<Politica | null>(null);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    let ativo = true;

    // A consulta e deliberadamente silenciosa: se a rede falhar ou a rota nao
    // existir, o aplicativo segue normalmente. Transformar indisponibilidade
    // de metadado em tela de erro seria pior do que o problema que ele evita.
    fetch(`${ENDERECO}/api/config/app-version`, {
      headers: { 'X-MyCash-App-Version': VERSAO_DO_APP },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: Politica | null) => {
        if (!ativo || !dados) return;
        setPolitica(dados);
        setDecisao(decidirAtualizacao(VERSAO_DO_APP, dados));
      })
      .catch(() => {});

    return () => {
      ativo = false;
    };
  }, []);

  function abrirLoja() {
    const url = Platform.OS === 'ios' ? politica?.loja.ios : politica?.loja.android;
    if (url) Linking.openURL(url);
  }

  if (decisao === 'em-dia' || !politica) return null;

  // --- Bloqueio: sem botao de fechar, sem como contornar ---
  if (decisao === 'obrigatoria') {
    return (
      <Modal visible transparent={false} animationType="fade">
        <View style={proprios.bloqueio}>
          <View style={[proprios.selo, { backgroundColor: cores.dangerMuted }]}>
            <Ionicons name="arrow-up-circle" size={44} color={cores.danger} />
          </View>

          <Text style={proprios.bloqueioTitulo}>Atualização necessária</Text>

          <Text style={proprios.bloqueioTexto}>
            Esta versão do MyCash não é mais compatível com o servidor. Atualize
            para continuar acompanhando suas finanças.
          </Text>

          <Text style={proprios.versoes}>
            Instalada {VERSAO_DO_APP} · mínima {politica.minimaSuportada}
          </Text>

          <Pressable
            onPress={abrirLoja}
            accessibilityRole="button"
            accessibilityLabel="Atualizar o aplicativo na loja"
            style={[proprios.botao, { backgroundColor: cores.accent }]}>
            <Text style={proprios.botaoTexto}>Atualizar agora</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  // --- Aviso dispensavel ---
  if (dispensado) return null;

  return (
    <View style={proprios.faixa}>
      <Ionicons name="information-circle-outline" size={18} color={cores.info} />

      <Text style={[ui.flex1, proprios.faixaTexto]} numberOfLines={2}>
        Versão {politica.maisRecente} disponível. Você está na {VERSAO_DO_APP}.
      </Text>

      <Pressable
        onPress={abrirLoja}
        accessibilityRole="button"
        accessibilityLabel="Atualizar o aplicativo">
        <Text style={[proprios.faixaAcao, { color: cores.accentLight }]}>Atualizar</Text>
      </Pressable>

      <Pressable
        onPress={() => setDispensado(true)}
        accessibilityRole="button"
        accessibilityLabel="Dispensar aviso de atualização"
        hitSlop={10}>
        <Ionicons name="close" size={18} color={cores.textMute} />
      </Pressable>
    </View>
  );
}

const useProprios = criarUseEstilos((cores: Cores) =>
  StyleSheet.create({
    faixa: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: cores.surface2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: cores.edge1,
    },
    faixaTexto: { fontSize: 12.5, color: cores.text },
    faixaAcao: { fontSize: 12.5, fontWeight: '700' },

    bloqueio: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      gap: 14,
      backgroundColor: cores.surface0,
    },
    selo: {
      width: 84,
      height: 84,
      borderRadius: 42,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bloqueioTitulo: { fontSize: 21, fontWeight: '800', color: cores.text },
    bloqueioTexto: {
      fontSize: 14.5,
      lineHeight: 21,
      color: cores.textMute,
      textAlign: 'center',
    },
    versoes: { fontSize: 12, color: cores.textMute, marginTop: 2 },
    botao: {
      marginTop: 10,
      paddingHorizontal: 26,
      paddingVertical: 13,
      borderRadius: 12,
      // 44pt e o alvo minimo confortavel para o polegar; abaixo disso a Lei
      // de Fitts cobra em erro de toque.
      minHeight: 44,
      justifyContent: 'center',
    },
    botaoTexto: { fontSize: 15, fontWeight: '700', color: '#06281c' },
  })
);
